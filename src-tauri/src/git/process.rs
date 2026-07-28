#[cfg(windows)]
mod platform {
    use std::{
        ffi::c_void,
        io,
        mem::size_of,
        os::windows::{io::AsRawHandle, process::CommandExt},
        process::{Child, Command},
        ptr,
        thread::JoinHandle,
    };

    use windows_sys::Win32::{
        Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE},
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD,
                THREADENTRY32,
            },
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
            Threading::{
                OpenThread, ResumeThread, CREATE_NO_WINDOW, CREATE_SUSPENDED, THREAD_SUSPEND_RESUME,
            },
            IO::CancelSynchronousIo,
        },
    };

    pub(crate) struct GitProcessGroup {
        job: OwnedHandle,
    }

    struct OwnedHandle(HANDLE);

    impl Drop for OwnedHandle {
        fn drop(&mut self) {
            // SAFETY: OwnedHandle is constructed only from a valid, uniquely owned Win32 handle.
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }

    impl GitProcessGroup {
        pub(crate) fn new() -> io::Result<Self> {
            // SAFETY: Null security attributes and name request a private job with default security.
            let job = unsafe { CreateJobObjectW(ptr::null(), ptr::null()) };
            if job.is_null() {
                return Err(io::Error::last_os_error());
            }
            let job = OwnedHandle(job);
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            // SAFETY: limits points to the structure required by this information class for the
            // duration of the call, and job is a valid job-object handle.
            let configured = unsafe {
                SetInformationJobObject(
                    job.0,
                    JobObjectExtendedLimitInformation,
                    (&raw const limits).cast::<c_void>(),
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            };
            if configured == 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(Self { job })
        }

        pub(crate) fn prepare_command(&self, command: &mut Command) {
            command.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
        }

        pub(crate) fn attach_and_resume(&self, child: &Child) -> io::Result<()> {
            // SAFETY: child owns a live process handle with the rights granted by CreateProcess,
            // and self.job is a valid job-object handle.
            let assigned =
                unsafe { AssignProcessToJobObject(self.job.0, child.as_raw_handle() as HANDLE) };
            if assigned == 0 {
                return Err(io::Error::last_os_error());
            }
            resume_suspended_process(child.id())
        }

        pub(crate) fn terminate(&self) {
            // SAFETY: self.job remains valid for the entire call.
            unsafe {
                let _ = TerminateJobObject(self.job.0, 1);
            }
        }
    }

    pub(crate) fn cancel_blocking_io<T>(reader: &JoinHandle<T>) {
        // SAFETY: JoinHandle exposes a borrowed native thread handle which remains valid while
        // reader is borrowed. The thread performs only synchronous pipe reads.
        unsafe {
            let _ = CancelSynchronousIo(reader.as_raw_handle() as HANDLE);
        }
    }

    fn resume_suspended_process(process_id: u32) -> io::Result<()> {
        // SAFETY: Snapshot flags and process id follow the ToolHelp contract.
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(io::Error::last_os_error());
        }
        let snapshot = OwnedHandle(snapshot);
        let mut entry = THREADENTRY32 {
            dwSize: size_of::<THREADENTRY32>() as u32,
            ..THREADENTRY32::default()
        };

        // SAFETY: entry has the required size and remains writable during enumeration.
        let mut has_entry = unsafe { Thread32First(snapshot.0, &raw mut entry) };
        while has_entry != 0 {
            if entry.th32OwnerProcessID == process_id {
                // SAFETY: The enumerated thread id belongs to the newly created process, and the
                // returned handle is checked before use.
                let thread = unsafe { OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID) };
                if thread.is_null() {
                    return Err(io::Error::last_os_error());
                }
                let thread = OwnedHandle(thread);
                // SAFETY: thread is a valid handle opened with THREAD_SUSPEND_RESUME.
                if unsafe { ResumeThread(thread.0) } == u32::MAX {
                    return Err(io::Error::last_os_error());
                }
                return Ok(());
            }
            // SAFETY: snapshot and entry remain valid for the next enumeration call.
            has_entry = unsafe { Thread32Next(snapshot.0, &raw mut entry) };
        }

        Err(io::Error::new(
            io::ErrorKind::NotFound,
            "suspended Git process thread was not found",
        ))
    }

    #[cfg(test)]
    mod tests {
        use std::{
            io::Read,
            process::Stdio,
            thread,
            time::{Duration, Instant},
        };

        use super::{cancel_blocking_io, GitProcessGroup};

        fn managed_command(script: &str) -> (GitProcessGroup, std::process::Child) {
            let group = GitProcessGroup::new().expect("create process group");
            let mut command = std::process::Command::new("cmd.exe");
            command
                .args(["/D", "/S", "/C", script])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            group.prepare_command(&mut command);
            let child = command.spawn().expect("spawn suspended command");
            group
                .attach_and_resume(&child)
                .expect("assign and resume command");
            (group, child)
        }

        #[test]
        fn suspended_command_resumes_after_job_assignment() {
            let (_group, mut child) = managed_command("exit 0");
            assert!(child.wait().expect("wait for command").success());
        }

        #[test]
        fn terminating_the_job_stops_its_process() {
            let (group, mut child) = managed_command("ping 127.0.0.1 -n 30 >NUL");
            group.terminate();
            let deadline = Instant::now() + Duration::from_secs(2);
            while child.try_wait().expect("monitor command").is_none() {
                assert!(Instant::now() < deadline, "managed process did not stop");
                thread::sleep(Duration::from_millis(10));
            }
        }

        #[test]
        fn terminating_the_job_releases_a_descendant_held_output_pipe() {
            let group = GitProcessGroup::new().expect("create process group");
            let mut command = std::process::Command::new("powershell.exe");
            command
                .args([
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    "$null = Start-Process -FilePath 'ping.exe' -ArgumentList '127.0.0.1','-n','30' -NoNewWindow -PassThru; Write-Output 'root-done'",
                ])
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::null());
            group.prepare_command(&mut command);
            let mut child = command.spawn().expect("spawn suspended command");
            group
                .attach_and_resume(&child)
                .expect("assign and resume command");
            let mut stdout = child.stdout.take().expect("take stdout");
            // PowerShell startup on shared CI runners can be delayed by cold .NET/AMSI startup.
            // This deadline protects against a deadlock; it is not a process-startup benchmark.
            let root_deadline = Instant::now() + Duration::from_secs(30);
            let root_status = loop {
                if let Some(status) = child.try_wait().expect("monitor root command") {
                    break status;
                }
                if Instant::now() >= root_deadline {
                    group.terminate();
                    panic!("root command did not exit before its descendant");
                }
                thread::sleep(Duration::from_millis(10));
            };
            assert!(root_status.success());

            let reader = thread::spawn(move || {
                let mut output = Vec::new();
                let _ = stdout.read_to_end(&mut output);
                output
            });
            thread::sleep(Duration::from_millis(50));
            assert!(
                !reader.is_finished(),
                "descendant should still hold the inherited pipe"
            );

            group.terminate();
            cancel_blocking_io(&reader);
            let deadline = Instant::now() + Duration::from_secs(2);
            while !reader.is_finished() {
                assert!(Instant::now() < deadline, "output reader did not stop");
                thread::sleep(Duration::from_millis(10));
            }
            let output = reader.join().expect("join output reader");
            assert!(String::from_utf8_lossy(&output).contains("root-done"));
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use std::{
        io,
        process::{Child, Command},
        thread::JoinHandle,
    };

    pub(crate) struct GitProcessGroup;

    impl GitProcessGroup {
        pub(crate) fn new() -> io::Result<Self> {
            Ok(Self)
        }

        pub(crate) fn prepare_command(&self, _command: &mut Command) {}

        pub(crate) fn attach_and_resume(&self, _child: &Child) -> io::Result<()> {
            Ok(())
        }

        pub(crate) fn terminate(&self) {}
    }

    pub(crate) fn cancel_blocking_io<T>(_reader: &JoinHandle<T>) {}
}

pub(crate) use platform::{cancel_blocking_io, GitProcessGroup};
