using System;
using System.Diagnostics;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace RepoPuck.Editor
{
    [InitializeOnLoad]
    internal static class RepoPuckAutoLaunch
    {
        private const string SessionKey = "RepoPuck.EditorBridge.OpenRequested";

        static RepoPuckAutoLaunch()
        {
            if (!Application.isBatchMode)
            {
                EditorApplication.delayCall += OpenCurrentProject;
            }
        }

        private static void OpenCurrentProject()
        {
            if (SessionState.GetBool(SessionKey, false))
            {
                return;
            }

            SessionState.SetBool(SessionKey, true);
            var projectDirectory = Directory.GetParent(Application.dataPath)?.FullName;
            if (string.IsNullOrWhiteSpace(projectDirectory))
            {
                return;
            }

            var uri = $"repopuck://open?path={Uri.EscapeDataString(projectDirectory)}";
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = uri,
                    UseShellExecute = true,
                    CreateNoWindow = true
                });
            }
            catch (Exception error)
            {
                UnityEngine.Debug.LogWarning(
                    $"RepoPuck could not open this Unity project: {error.Message}"
                );
            }
        }
    }
}
