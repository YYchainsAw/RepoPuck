const PUCK_OVERLAP: i64 = 10;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DockCorner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

impl DockCorner {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::TopLeft => "top-left",
            Self::TopRight => "top-right",
            Self::BottomLeft => "bottom-left",
            Self::BottomRight => "bottom-right",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PanelPlacement {
    pub position: Point,
    /// The panel corner touched by the puck. This is also the animation origin.
    pub corner: DockCorner,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

impl Point {
    pub const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Size {
    pub width: u32,
    pub height: u32,
}

impl Size {
    pub const fn new(width: u32, height: u32) -> Self {
        Self { width, height }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Rect {
    pub const fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    pub fn right(self) -> i32 {
        to_i32(i64::from(self.x) + i64::from(self.width))
    }

    pub fn bottom(self) -> i32 {
        to_i32(i64::from(self.y) + i64::from(self.height))
    }

    pub fn contains(self, point: Point) -> bool {
        point.x >= self.x && point.y >= self.y && point.x < self.right() && point.y < self.bottom()
    }
}

/// Returns the total non-client width and height around a window's client area.
pub fn window_frame_size(outer: Size, inner: Size) -> Size {
    Size::new(
        outer.width.saturating_sub(inner.width),
        outer.height.saturating_sub(inner.height),
    )
}

/// Fits a desired client size into a work area while reserving the native frame.
pub fn fit_window_inner_size(desired: Size, frame: Size, work_area: Size) -> Size {
    Size::new(
        desired
            .width
            .min(work_area.width.saturating_sub(frame.width)),
        desired
            .height
            .min(work_area.height.saturating_sub(frame.height)),
    )
}

/// Clamps an existing outer window rectangle into a monitor work area.
pub fn clamp_window_position(window: Rect, work_area: Rect) -> Point {
    let work_left = i64::from(work_area.x);
    let work_top = i64::from(work_area.y);
    let work_right = work_left + i64::from(work_area.width);
    let work_bottom = work_top + i64::from(work_area.height);
    let max_x = work_right.saturating_sub(i64::from(window.width));
    let max_y = work_bottom.saturating_sub(i64::from(window.height));

    Point::new(
        to_i32(clamp(i64::from(window.x), work_left, max_x)),
        to_i32(clamp(i64::from(window.y), work_top, max_y)),
    )
}

/// Reserves enough work-area space for the visible puck to sit outside a panel
/// corner while preserving the configured overlap.
pub fn dock_safe_panel_work_area(work_area: Rect, puck: Size, corner: DockCorner) -> Rect {
    let horizontal = puck.width.saturating_sub(PUCK_OVERLAP as u32);
    let vertical = puck.height.saturating_sub(PUCK_OVERLAP as u32);
    let inset_x = horizontal.min(work_area.width);
    let inset_y = vertical.min(work_area.height);
    let x = match corner {
        DockCorner::TopLeft | DockCorner::BottomLeft => {
            to_i32(i64::from(work_area.x) + i64::from(inset_x))
        }
        DockCorner::TopRight | DockCorner::BottomRight => work_area.x,
    };
    let y = match corner {
        DockCorner::TopLeft | DockCorner::TopRight => {
            to_i32(i64::from(work_area.y) + i64::from(inset_y))
        }
        DockCorner::BottomLeft | DockCorner::BottomRight => work_area.y,
    };

    Rect::new(
        x,
        y,
        work_area.width.saturating_sub(inset_x),
        work_area.height.saturating_sub(inset_y),
    )
}

#[derive(Clone, Copy)]
struct Candidate {
    position: Point,
    corner: DockCorner,
    available_width: i64,
    available_height: i64,
}

impl Candidate {
    fn fits(self, panel: Size) -> bool {
        self.available_width >= i64::from(panel.width)
            && self.available_height >= i64::from(panel.height)
    }

    fn area(self) -> i128 {
        i128::from(self.available_width.max(0)) * i128::from(self.available_height.max(0))
    }
}

/// Chooses the largest quadrant around the puck that can fully contain the panel.
///
/// `DockCorner` names the panel corner touched by the puck. For example, a panel
/// placed below and to the right of the puck has a `TopLeft` dock corner.
pub fn panel_placement(puck: Rect, panel: Size, work_area: Rect) -> PanelPlacement {
    let work_left = i64::from(work_area.x);
    let work_top = i64::from(work_area.y);
    let work_right = work_left + i64::from(work_area.width);
    let work_bottom = work_top + i64::from(work_area.height);
    let puck_left = i64::from(puck.x);
    let puck_top = i64::from(puck.y);
    let puck_right = puck_left + i64::from(puck.width);
    let puck_bottom = puck_top + i64::from(puck.height);
    let panel_width = i64::from(panel.width);
    let panel_height = i64::from(panel.height);

    let left_width = puck_left + PUCK_OVERLAP - work_left;
    let right_width = work_right - (puck_right - PUCK_OVERLAP);
    let top_height = puck_top + PUCK_OVERLAP - work_top;
    let bottom_height = work_bottom - (puck_bottom - PUCK_OVERLAP);

    // Stable ordering is intentional: equal inputs always choose the same corner.
    let candidates = [
        Candidate {
            position: Point::new(
                to_i32(puck_right - PUCK_OVERLAP),
                to_i32(puck_bottom - PUCK_OVERLAP),
            ),
            corner: DockCorner::TopLeft,
            available_width: right_width,
            available_height: bottom_height,
        },
        Candidate {
            position: Point::new(
                to_i32(puck_left + PUCK_OVERLAP - panel_width),
                to_i32(puck_bottom - PUCK_OVERLAP),
            ),
            corner: DockCorner::TopRight,
            available_width: left_width,
            available_height: bottom_height,
        },
        Candidate {
            position: Point::new(
                to_i32(puck_right - PUCK_OVERLAP),
                to_i32(puck_top + PUCK_OVERLAP - panel_height),
            ),
            corner: DockCorner::BottomLeft,
            available_width: right_width,
            available_height: top_height,
        },
        Candidate {
            position: Point::new(
                to_i32(puck_left + PUCK_OVERLAP - panel_width),
                to_i32(puck_top + PUCK_OVERLAP - panel_height),
            ),
            corner: DockCorner::BottomRight,
            available_width: left_width,
            available_height: top_height,
        },
    ];

    let any_fit = candidates.iter().any(|candidate| candidate.fits(panel));
    let chosen = candidates
        .into_iter()
        .filter(|candidate| !any_fit || candidate.fits(panel))
        .max_by_key(|candidate| candidate.area())
        .expect("the four dock candidates are always present");
    let max_x = work_right.saturating_sub(panel_width);
    let max_y = work_bottom.saturating_sub(panel_height);
    let position = Point::new(
        to_i32(clamp(i64::from(chosen.position.x), work_left, max_x)),
        to_i32(clamp(i64::from(chosen.position.y), work_top, max_y)),
    );

    PanelPlacement {
        position,
        corner: chosen.corner,
    }
}

/// Keeps the puck attached just outside the selected panel corner.
pub fn puck_position(panel: Rect, puck: Size, corner: DockCorner, work_area: Rect) -> Point {
    let panel_left = i64::from(panel.x);
    let panel_top = i64::from(panel.y);
    let panel_right = panel_left + i64::from(panel.width);
    let panel_bottom = panel_top + i64::from(panel.height);
    let puck_width = i64::from(puck.width);
    let puck_height = i64::from(puck.height);
    let (x, y) = match corner {
        DockCorner::TopLeft => (
            panel_left - puck_width + PUCK_OVERLAP,
            panel_top - puck_height + PUCK_OVERLAP,
        ),
        DockCorner::TopRight => (
            panel_right - PUCK_OVERLAP,
            panel_top - puck_height + PUCK_OVERLAP,
        ),
        DockCorner::BottomLeft => (
            panel_left - puck_width + PUCK_OVERLAP,
            panel_bottom - PUCK_OVERLAP,
        ),
        DockCorner::BottomRight => (panel_right - PUCK_OVERLAP, panel_bottom - PUCK_OVERLAP),
    };
    let work_left = i64::from(work_area.x);
    let work_top = i64::from(work_area.y);
    let work_right = work_left + i64::from(work_area.width);
    let work_bottom = work_top + i64::from(work_area.height);

    Point::new(
        to_i32(clamp(x, work_left, work_right - puck_width)),
        to_i32(clamp(y, work_top, work_bottom - puck_height)),
    )
}

pub fn restore_relative_position(relative: Point, puck: Size, work_area: Rect) -> Point {
    let max_x = i64::from(work_area.width).saturating_sub(i64::from(puck.width));
    let max_y = i64::from(work_area.height).saturating_sub(i64::from(puck.height));
    let x = i64::from(work_area.x) + clamp(i64::from(relative.x), 0, max_x);
    let y = i64::from(work_area.y) + clamp(i64::from(relative.y), 0, max_y);
    Point::new(to_i32(x), to_i32(y))
}

/// Centers a window along the top of a work area and clamps oversized inputs.
pub fn top_center_position(window: Size, work_area: Rect, top_offset: u32) -> Point {
    let work_left = i64::from(work_area.x);
    let work_top = i64::from(work_area.y);
    let work_right = work_left + i64::from(work_area.width);
    let work_bottom = work_top + i64::from(work_area.height);
    let width = i64::from(window.width);
    let height = i64::from(window.height);
    let centered_x = work_left + (i64::from(work_area.width) - width) / 2;
    let desired_y = work_top + i64::from(top_offset);

    Point::new(
        to_i32(clamp(
            centered_x,
            work_left,
            work_right.saturating_sub(width),
        )),
        to_i32(clamp(
            desired_y,
            work_top,
            work_bottom.saturating_sub(height),
        )),
    )
}

/// Places a top-attached surface using a normalized horizontal travel anchor.
/// `0.0` is the left edge, `0.5` is centered, and `1.0` is the right edge.
pub fn anchored_top_position(window: Size, work_area: Rect, horizontal_anchor: f64) -> Point {
    let travel = work_area.width.saturating_sub(window.width);
    let offset =
        (f64::from(travel) * normalize_horizontal_anchor(horizontal_anchor)).round() as i64;
    Point::new(
        to_i32(i64::from(work_area.x).saturating_add(offset)),
        work_area.y,
    )
}

/// Converts a clamped top-surface position back into its normalized travel anchor.
pub fn horizontal_anchor_for_position(position: Point, window: Size, work_area: Rect) -> f64 {
    let travel = work_area.width.saturating_sub(window.width);
    if travel == 0 {
        return 0.5;
    }
    let offset = i64::from(position.x)
        .saturating_sub(i64::from(work_area.x))
        .clamp(0, i64::from(travel));
    offset as f64 / f64::from(travel)
}

pub fn normalize_horizontal_anchor(anchor: f64) -> f64 {
    if anchor.is_finite() {
        anchor.clamp(0.0, 1.0)
    } else {
        0.5
    }
}

/// Returns the usable area immediately below a top-centered anchor such as the island.
pub fn work_area_below_anchor(work_area: Rect, anchor: Rect) -> Rect {
    let top =
        i64::from(anchor.bottom()).clamp(i64::from(work_area.y), i64::from(work_area.bottom()));
    Rect::new(
        work_area.x,
        to_i32(top),
        work_area.width,
        (i64::from(work_area.bottom()) - top).max(0) as u32,
    )
}

/// Builds the drawer activation strip at a normalized top-edge anchor.
pub fn top_anchor_hot_zone(
    work_area: Rect,
    panel_width: u32,
    extra_width: u32,
    minimum_width: u32,
    height: u32,
    horizontal_anchor: f64,
) -> Rect {
    let width = panel_width
        .saturating_add(extra_width)
        .max(minimum_width)
        .min(work_area.width);
    let position = anchored_top_position(Size::new(width, height), work_area, horizontal_anchor);
    Rect::new(position.x, work_area.y, width, height.min(work_area.height))
}

/// Pads an interactive rectangle without overflowing integer coordinates.
pub fn padded_rect(rect: Rect, padding: u32) -> Rect {
    let padding = i64::from(padding);
    let left = i64::from(rect.x) - padding;
    let top = i64::from(rect.y) - padding;
    let width = i64::from(rect.width) + padding.saturating_mul(2);
    let height = i64::from(rect.height) + padding.saturating_mul(2);
    Rect::new(
        to_i32(left),
        to_i32(top),
        width.clamp(0, i64::from(u32::MAX)) as u32,
        height.clamp(0, i64::from(u32::MAX)) as u32,
    )
}

fn clamp(value: i64, minimum: i64, maximum: i64) -> i64 {
    value.max(minimum).min(maximum.max(minimum))
}

fn to_i32(value: i64) -> i32 {
    value.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32
}

#[cfg(test)]
mod tests {
    use super::{
        anchored_top_position, clamp_window_position, dock_safe_panel_work_area,
        fit_window_inner_size, horizontal_anchor_for_position, normalize_horizontal_anchor,
        padded_rect, panel_placement, puck_position, restore_relative_position,
        top_anchor_hot_zone, top_center_position, window_frame_size, work_area_below_anchor,
        DockCorner, Point, Rect, Size,
    };

    const PANEL: Size = Size::new(420, 720);
    const PUCK: Size = Size::new(58, 58);
    const WORK_AREA: Rect = Rect::new(0, 0, 1_920, 1_040);

    #[test]
    fn selects_each_panel_corner_from_the_puck_quadrant() {
        let cases = [
            (Rect::new(10, 10, 58, 58), DockCorner::TopLeft),
            (Rect::new(1_850, 10, 58, 58), DockCorner::TopRight),
            (Rect::new(10, 970, 58, 58), DockCorner::BottomLeft),
            (Rect::new(1_850, 970, 58, 58), DockCorner::BottomRight),
        ];

        for (puck, expected) in cases {
            let placement = panel_placement(puck, PANEL, WORK_AREA);
            assert_eq!(placement.corner, expected);
            assert!(placement.position.x >= WORK_AREA.x);
            assert!(placement.position.y >= WORK_AREA.y);
            assert!(placement.position.x + PANEL.width as i32 <= WORK_AREA.right());
            assert!(placement.position.y + PANEL.height as i32 <= WORK_AREA.bottom());
        }
    }

    #[test]
    fn repeated_placement_is_stable() {
        let puck = Rect::new(1_850, 970, PUCK.width, PUCK.height);

        assert_eq!(
            panel_placement(puck, PANEL, WORK_AREA),
            panel_placement(puck, PANEL, WORK_AREA)
        );
    }

    #[test]
    fn clamps_near_edges_when_no_quadrant_fully_fits() {
        let work_area = Rect::new(0, 0, 800, 700);
        let panel = Size::new(720, 640);
        let placement = panel_placement(Rect::new(371, 321, 58, 58), panel, work_area);

        assert!(placement.position.x >= work_area.x);
        assert!(placement.position.y >= work_area.y);
        assert!(placement.position.x + panel.width as i32 <= work_area.right());
        assert!(placement.position.y + panel.height as i32 <= work_area.bottom());
    }

    #[test]
    fn respects_negative_multi_monitor_coordinates() {
        let work_area = Rect::new(-1_920, -40, 1_920, 1_040);
        let puck = Rect::new(-70, 900, PUCK.width, PUCK.height);
        let placement = panel_placement(puck, PANEL, work_area);

        assert_eq!(placement.corner, DockCorner::BottomRight);
        assert!(placement.position.x >= work_area.x);
        assert!(placement.position.y >= work_area.y);
        assert!(placement.position.x + PANEL.width as i32 <= work_area.right());
        assert!(placement.position.y + PANEL.height as i32 <= work_area.bottom());
    }

    #[test]
    fn reattaches_the_puck_to_all_four_panel_corners() {
        let panel = Rect::new(500, 200, PANEL.width, PANEL.height);
        let cases = [
            (DockCorner::TopLeft, Point::new(452, 152)),
            (DockCorner::TopRight, Point::new(910, 152)),
            (DockCorner::BottomLeft, Point::new(452, 910)),
            (DockCorner::BottomRight, Point::new(910, 910)),
        ];

        for (corner, expected) in cases {
            assert_eq!(puck_position(panel, PUCK, corner, WORK_AREA), expected);
        }
    }

    #[test]
    fn restores_monitor_relative_puck_positions_inside_the_work_area() {
        let work_area = Rect::new(-1_920, 20, 1_920, 1_020);

        assert_eq!(
            restore_relative_position(Point::new(1_900, 1_000), PUCK, work_area),
            Point::new(-58, 982)
        );
        assert_eq!(
            restore_relative_position(Point::new(-50, -25), PUCK, work_area),
            Point::new(-1_920, 20)
        );
    }

    #[test]
    fn fits_client_size_without_counting_the_native_frame_as_content() {
        let frame = window_frame_size(Size::new(752, 992), Size::new(736, 976));

        assert_eq!(frame, Size::new(16, 16));
        assert_eq!(
            fit_window_inner_size(Size::new(1_260, 1_680), frame, Size::new(1_920, 1_040),),
            Size::new(1_260, 1_024),
        );
    }

    #[test]
    fn clamps_an_outer_window_on_negative_monitor_coordinates() {
        let work_area = Rect::new(-1_920, -40, 1_920, 1_040);

        assert_eq!(
            clamp_window_position(Rect::new(-100, 900, 720, 960), work_area),
            Point::new(-720, 40),
        );
        assert_eq!(
            clamp_window_position(Rect::new(-2_200, -200, 420, 720), work_area),
            Point::new(-1_920, -40),
        );
    }

    #[test]
    fn reserves_visible_puck_space_for_each_attached_corner() {
        let cases = [
            (DockCorner::TopLeft, Rect::new(48, 48, 1_872, 992)),
            (DockCorner::TopRight, Rect::new(0, 48, 1_872, 992)),
            (DockCorner::BottomLeft, Rect::new(48, 0, 1_872, 992)),
            (DockCorner::BottomRight, Rect::new(0, 0, 1_872, 992)),
        ];

        for (corner, expected) in cases {
            assert_eq!(dock_safe_panel_work_area(WORK_AREA, PUCK, corner), expected);
        }
    }

    #[test]
    fn centers_top_surfaces_on_negative_monitor_coordinates() {
        let work_area = Rect::new(-2_560, 48, 2_560, 1_392);

        assert_eq!(
            top_center_position(Size::new(480, 96), work_area, 16),
            Point::new(-1_520, 64)
        );
        assert_eq!(
            top_center_position(Size::new(840, 1_200), work_area, 96),
            Point::new(-1_700, 144)
        );
    }

    #[test]
    fn derives_island_panel_area_below_the_visible_anchor() {
        let work_area = Rect::new(0, 40, 1_920, 1_000);
        let island = Rect::new(720, 48, 480, 96);

        assert_eq!(
            work_area_below_anchor(work_area, island),
            Rect::new(0, 144, 1_920, 896)
        );
    }

    #[test]
    fn drawer_hot_zone_is_centered_bounded_and_contains_edge_points() {
        let work_area = Rect::new(-1_920, -40, 1_920, 1_040);
        let hot_zone = top_anchor_hot_zone(work_area, 840, 96, 560, 12, 0.5);

        assert_eq!(hot_zone, Rect::new(-1_428, -40, 936, 12));
        assert!(hot_zone.contains(Point::new(-960, -40)));
        assert!(!hot_zone.contains(Point::new(-960, -28)));
        assert_eq!(
            top_anchor_hot_zone(work_area, 840, 96, 560, 12, 0.0).x,
            work_area.x
        );
        assert_eq!(
            top_anchor_hot_zone(work_area, 840, 96, 560, 12, 1.0).right(),
            work_area.right()
        );
    }

    #[test]
    fn drawer_anchor_clamps_and_survives_negative_coordinates_and_dpi_sizes() {
        let work_area = Rect::new(-2_560, 48, 2_560, 1_392);
        let panel = Size::new(735, 1_000);

        assert_eq!(
            anchored_top_position(panel, work_area, -1.0),
            Point::new(-2_560, 48)
        );
        assert_eq!(
            anchored_top_position(panel, work_area, 0.5),
            Point::new(-1_647, 48)
        );
        assert_eq!(
            anchored_top_position(panel, work_area, 1.5),
            Point::new(-735, 48)
        );
        let three_quarters = anchored_top_position(panel, work_area, 0.75);
        assert!(
            (horizontal_anchor_for_position(three_quarters, panel, work_area) - 0.75).abs() < 0.001
        );
        assert_eq!(normalize_horizontal_anchor(f64::NAN), 0.5);
    }

    #[test]
    fn drawer_anchor_is_preserved_when_the_panel_width_changes() {
        let work_area = Rect::new(-1_920, -40, 1_920, 1_040);
        let compact = Size::new(420, 720);
        let wide = Size::new(720, 720);

        let compact_position = anchored_top_position(compact, work_area, 0.8);
        let restored_anchor = horizontal_anchor_for_position(compact_position, compact, work_area);
        let wide_position = anchored_top_position(wide, work_area, restored_anchor);

        assert_eq!(compact_position.y, work_area.y);
        assert_eq!(wide_position.y, work_area.y);
        assert!(
            (horizontal_anchor_for_position(wide_position, wide, work_area) - 0.8).abs() < 0.001
        );
    }

    #[test]
    fn pads_panel_hit_regions_on_virtual_desktop_coordinates() {
        assert_eq!(
            padded_rect(Rect::new(-800, -20, 420, 720), 12),
            Rect::new(-812, -32, 444, 744)
        );
    }
}
