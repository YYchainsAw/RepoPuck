use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};

use super::position::DockCorner;

pub const DRAWER_DWELL: Duration = Duration::from_millis(120);
pub const DRAWER_LEAVE_DELAY: Duration = Duration::from_millis(500);

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ShellMode {
    #[default]
    Puck,
    TopIsland,
    TopDrawer,
}

impl ShellMode {
    pub const fn key(self) -> &'static str {
        match self {
            Self::Puck => "puck",
            Self::TopIsland => "top-island",
            Self::TopDrawer => "top-drawer",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PanelPhase {
    #[default]
    Hidden,
    Opening,
    Open,
    Closing,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PanelIntent {
    Show,
    Hide,
    Toggle,
}

pub const fn should_restore_panel_after_mode_change(
    phase: PanelPhase,
    native_visible: bool,
) -> bool {
    matches!(phase, PanelPhase::Opening | PanelPhase::Open)
        || (native_visible && !matches!(phase, PanelPhase::Closing))
}

pub const fn stable_panel_phase(panel_visible: bool) -> PanelPhase {
    if panel_visible {
        PanelPhase::Open
    } else {
        PanelPhase::Hidden
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PhaseTransition {
    pub transition_id: u64,
    pub phase: PanelPhase,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellSnapshot {
    pub mode: ShellMode,
    pub panel_phase: PanelPhase,
    pub transition_id: u64,
    pub active_monitor_name: Option<String>,
    pub dock_corner: Option<String>,
}

#[derive(Debug, Default)]
pub struct DrawerHoverTracker {
    hot_since: Option<Instant>,
    outside_since: Option<Instant>,
}

impl DrawerHoverTracker {
    pub fn reset(&mut self) {
        self.hot_since = None;
        self.outside_since = None;
    }

    pub fn update(
        &mut self,
        now: Instant,
        in_hot_zone: bool,
        in_panel: bool,
        phase: PanelPhase,
    ) -> Option<PanelIntent> {
        match phase {
            PanelPhase::Hidden => {
                self.outside_since = None;
                if !in_hot_zone {
                    self.hot_since = None;
                    return None;
                }
                let started = self.hot_since.get_or_insert(now);
                if now.duration_since(*started) < DRAWER_DWELL {
                    return None;
                }
                self.hot_since = None;
                Some(PanelIntent::Show)
            }
            PanelPhase::Closing if in_hot_zone || in_panel => {
                self.reset();
                Some(PanelIntent::Show)
            }
            PanelPhase::Closing => {
                self.hot_since = None;
                self.outside_since = None;
                None
            }
            PanelPhase::Opening | PanelPhase::Open => {
                self.hot_since = None;
                if in_hot_zone || in_panel {
                    self.outside_since = None;
                    return None;
                }
                let started = self.outside_since.get_or_insert(now);
                if now.duration_since(*started) < DRAWER_LEAVE_DELAY {
                    return None;
                }
                self.outside_since = None;
                Some(PanelIntent::Hide)
            }
        }
    }
}

#[derive(Debug, Default)]
pub struct ShellRuntime {
    pub mode: ShellMode,
    pub phase: PanelPhase,
    pub transition_id: u64,
    pub dock_corner: Option<DockCorner>,
    pub active_monitor_name: Option<String>,
    pub drawer_anchors: HashMap<String, f64>,
    pub drawer_hover: DrawerHoverTracker,
}

impl ShellRuntime {
    pub fn snapshot(&self) -> ShellSnapshot {
        ShellSnapshot {
            mode: self.mode,
            panel_phase: self.phase,
            transition_id: self.transition_id,
            active_monitor_name: self.active_monitor_name.clone(),
            dock_corner: self.dock_corner.map(|corner| corner.as_str().to_owned()),
        }
    }

    pub fn apply_intent(&mut self, intent: PanelIntent) -> Option<PhaseTransition> {
        let target = match intent {
            PanelIntent::Show if matches!(self.phase, PanelPhase::Opening | PanelPhase::Open) => {
                return None;
            }
            PanelIntent::Hide if matches!(self.phase, PanelPhase::Hidden | PanelPhase::Closing) => {
                return None;
            }
            PanelIntent::Show => PanelPhase::Opening,
            PanelIntent::Hide => PanelPhase::Closing,
            PanelIntent::Toggle if matches!(self.phase, PanelPhase::Opening | PanelPhase::Open) => {
                PanelPhase::Closing
            }
            PanelIntent::Toggle => PanelPhase::Opening,
        };
        self.transition_id = self.transition_id.wrapping_add(1);
        self.phase = target;
        Some(PhaseTransition {
            transition_id: self.transition_id,
            phase: target,
        })
    }

    pub fn complete_transition(&mut self, transition_id: u64) -> Option<PanelPhase> {
        if transition_id != self.transition_id {
            return None;
        }
        self.phase = match self.phase {
            PanelPhase::Opening => PanelPhase::Open,
            PanelPhase::Closing => PanelPhase::Hidden,
            PanelPhase::Hidden | PanelPhase::Open => return None,
        };
        Some(self.phase)
    }

    pub fn change_mode(&mut self, mode: ShellMode) -> bool {
        if self.mode == mode {
            return false;
        }
        self.transition_id = self.transition_id.wrapping_add(1);
        self.mode = mode;
        self.phase = PanelPhase::Hidden;
        self.dock_corner = None;
        self.drawer_hover.reset();
        true
    }

    pub fn restore_mode_after_failed_change(
        &mut self,
        mode: ShellMode,
        panel_visible: bool,
        dock_corner: Option<DockCorner>,
        active_monitor_name: Option<String>,
        drawer_anchors: HashMap<String, f64>,
    ) {
        self.transition_id = self.transition_id.wrapping_add(1);
        self.mode = mode;
        self.phase = stable_panel_phase(panel_visible);
        self.dock_corner = dock_corner;
        self.active_monitor_name = active_monitor_name;
        self.drawer_anchors = drawer_anchors;
        self.drawer_hover.reset();
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        time::{Duration, Instant},
    };

    use super::{
        should_restore_panel_after_mode_change, stable_panel_phase, DrawerHoverTracker,
        PanelIntent, PanelPhase, ShellMode, ShellRuntime, DRAWER_DWELL, DRAWER_LEAVE_DELAY,
    };

    #[test]
    fn serializes_modes_and_snapshot_fields_for_the_frontend_contract() {
        assert_eq!(
            serde_json::to_string(&ShellMode::TopIsland).expect("mode json"),
            "\"top-island\""
        );
        assert_eq!(
            serde_json::to_string(&ShellMode::TopDrawer).expect("mode json"),
            "\"top-drawer\""
        );
        assert_eq!(
            serde_json::to_value(ShellRuntime::default().snapshot()).expect("snapshot json"),
            serde_json::json!({
                "mode": "puck",
                "panelPhase": "hidden",
                "transitionId": 0,
                "activeMonitorName": null,
                "dockCorner": null,
            })
        );
    }

    #[test]
    fn panel_intents_reverse_in_flight_transitions_and_ignore_stale_completions() {
        let mut runtime = ShellRuntime::default();
        let opening = runtime
            .apply_intent(PanelIntent::Toggle)
            .expect("opening transition");
        let closing = runtime
            .apply_intent(PanelIntent::Toggle)
            .expect("closing transition");

        assert_eq!(opening.phase, PanelPhase::Opening);
        assert_eq!(closing.phase, PanelPhase::Closing);
        assert_eq!(runtime.complete_transition(opening.transition_id), None);
        assert_eq!(
            runtime.complete_transition(closing.transition_id),
            Some(PanelPhase::Hidden)
        );

        let reopened = runtime
            .apply_intent(PanelIntent::Show)
            .expect("reopening transition");
        assert_eq!(reopened.phase, PanelPhase::Opening);
        assert_eq!(
            runtime.complete_transition(reopened.transition_id),
            Some(PanelPhase::Open)
        );
        assert_eq!(runtime.apply_intent(PanelIntent::Show), None);
    }

    #[test]
    fn changing_modes_invalidates_transitions_and_resets_panel_state() {
        let mut runtime = ShellRuntime::default();
        let opening = runtime
            .apply_intent(PanelIntent::Show)
            .expect("opening transition");

        assert!(runtime.change_mode(ShellMode::TopDrawer));
        assert_eq!(runtime.mode, ShellMode::TopDrawer);
        assert_eq!(runtime.phase, PanelPhase::Hidden);
        assert_eq!(runtime.complete_transition(opening.transition_id), None);
        assert!(should_restore_panel_after_mode_change(opening.phase, true));
        let reopened = runtime
            .apply_intent(PanelIntent::Show)
            .expect("mode switch reopens visible panel");
        assert_eq!(reopened.phase, PanelPhase::Opening);
        assert!(!runtime.change_mode(ShellMode::TopDrawer));
    }

    #[test]
    fn failed_mode_change_restores_a_stable_old_mode_and_invalidates_pending_work() {
        let mut runtime = ShellRuntime {
            mode: ShellMode::Puck,
            dock_corner: Some(super::DockCorner::BottomRight),
            active_monitor_name: Some("DISPLAY1".to_owned()),
            ..Default::default()
        };
        let opening = runtime
            .apply_intent(PanelIntent::Show)
            .expect("opening transition");
        assert!(runtime.change_mode(ShellMode::TopIsland));
        let changed_transition_id = runtime.transition_id;

        runtime.restore_mode_after_failed_change(
            ShellMode::Puck,
            true,
            Some(super::DockCorner::BottomRight),
            Some("DISPLAY1".to_owned()),
            HashMap::from([("DISPLAY1".to_owned(), 0.25)]),
        );

        assert_eq!(runtime.mode, ShellMode::Puck);
        assert_eq!(runtime.phase, PanelPhase::Open);
        assert_eq!(runtime.dock_corner, Some(super::DockCorner::BottomRight));
        assert_eq!(runtime.active_monitor_name.as_deref(), Some("DISPLAY1"));
        assert_eq!(runtime.drawer_anchors.get("DISPLAY1"), Some(&0.25));
        assert_ne!(runtime.transition_id, changed_transition_id);
        assert_eq!(runtime.complete_transition(opening.transition_id), None);
    }

    #[test]
    fn mode_switch_does_not_resurrect_a_panel_that_was_closing() {
        assert!(!should_restore_panel_after_mode_change(
            PanelPhase::Closing,
            true
        ));
        assert!(!should_restore_panel_after_mode_change(
            PanelPhase::Hidden,
            false
        ));
        assert!(should_restore_panel_after_mode_change(
            PanelPhase::Open,
            true
        ));
        assert_eq!(stable_panel_phase(false), PanelPhase::Hidden);
        assert_eq!(stable_panel_phase(true), PanelPhase::Open);
    }

    #[test]
    fn drawer_requires_dwell_and_delays_hiding_after_pointer_exit() {
        let base = Instant::now();
        let mut hover = DrawerHoverTracker::default();

        assert_eq!(hover.update(base, true, false, PanelPhase::Hidden), None);
        assert_eq!(
            hover.update(
                base + DRAWER_DWELL - Duration::from_millis(1),
                true,
                false,
                PanelPhase::Hidden,
            ),
            None
        );
        assert_eq!(
            hover.update(base + DRAWER_DWELL, true, false, PanelPhase::Hidden,),
            Some(PanelIntent::Show)
        );

        let left_at = base + Duration::from_secs(1);
        assert_eq!(hover.update(left_at, false, false, PanelPhase::Open), None);
        assert_eq!(
            hover.update(
                left_at + DRAWER_LEAVE_DELAY - Duration::from_millis(1),
                false,
                false,
                PanelPhase::Open,
            ),
            None
        );
        assert_eq!(
            hover.update(left_at + DRAWER_LEAVE_DELAY, false, false, PanelPhase::Open,),
            Some(PanelIntent::Hide)
        );
    }

    #[test]
    fn drawer_reentry_cancels_hiding_and_reverses_a_close_immediately() {
        let base = Instant::now();
        let mut hover = DrawerHoverTracker::default();

        assert_eq!(hover.update(base, false, false, PanelPhase::Open), None);
        assert_eq!(
            hover.update(
                base + Duration::from_millis(250),
                true,
                false,
                PanelPhase::Open,
            ),
            None
        );
        assert_eq!(
            hover.update(
                base + Duration::from_millis(300),
                true,
                false,
                PanelPhase::Closing,
            ),
            Some(PanelIntent::Show)
        );
    }
}
