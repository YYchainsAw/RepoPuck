const PANEL_GAP: i64 = 12;

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

    #[cfg(test)]
    pub fn right(self) -> i32 {
        to_i32(i64::from(self.x) + i64::from(self.width))
    }

    #[cfg(test)]
    pub fn bottom(self) -> i32 {
        to_i32(i64::from(self.y) + i64::from(self.height))
    }
}

pub fn panel_position(puck: Rect, panel: Size, work_area: Rect) -> Point {
    let work_left = i64::from(work_area.x);
    let work_top = i64::from(work_area.y);
    let work_right = work_left + i64::from(work_area.width);
    let work_bottom = work_top + i64::from(work_area.height);
    let panel_width = i64::from(panel.width);
    let panel_height = i64::from(panel.height);
    let right_candidate = i64::from(puck.x) + i64::from(puck.width) + PANEL_GAP;
    let left_candidate = i64::from(puck.x) - PANEL_GAP - panel_width;

    let x = if right_candidate + panel_width <= work_right {
        right_candidate
    } else if left_candidate >= work_left {
        left_candidate
    } else {
        clamp(i64::from(puck.x), work_left, work_right - panel_width)
    };
    let centered_y = i64::from(puck.y) + (i64::from(puck.height) - panel_height) / 2;
    let y = clamp(centered_y, work_top, work_bottom - panel_height);

    Point::new(to_i32(x), to_i32(y))
}

pub fn restore_relative_position(relative: Point, puck: Size, work_area: Rect) -> Point {
    let max_x = i64::from(work_area.width).saturating_sub(i64::from(puck.width));
    let max_y = i64::from(work_area.height).saturating_sub(i64::from(puck.height));
    let x = i64::from(work_area.x) + clamp(i64::from(relative.x), 0, max_x);
    let y = i64::from(work_area.y) + clamp(i64::from(relative.y), 0, max_y);
    Point::new(to_i32(x), to_i32(y))
}

fn clamp(value: i64, minimum: i64, maximum: i64) -> i64 {
    value.max(minimum).min(maximum.max(minimum))
}

fn to_i32(value: i64) -> i32 {
    value.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32
}

#[cfg(test)]
mod tests {
    use super::{panel_position, restore_relative_position, Point, Rect, Size};

    const PANEL: Size = Size::new(420, 720);
    const PUCK: Size = Size::new(58, 58);
    const WORK_AREA: Rect = Rect::new(0, 0, 1_920, 1_040);

    #[test]
    fn places_the_panel_to_the_right_when_space_is_available() {
        let puck = Rect::new(12, 420, PUCK.width, PUCK.height);

        assert_eq!(panel_position(puck, PANEL, WORK_AREA), Point::new(82, 89));
    }

    #[test]
    fn places_the_panel_to_the_left_near_the_right_edge() {
        let puck = Rect::new(1_850, 420, PUCK.width, PUCK.height);

        assert_eq!(
            panel_position(puck, PANEL, WORK_AREA),
            Point::new(1_418, 89)
        );
    }

    #[test]
    fn clamps_the_panel_inside_top_and_bottom_work_area_edges() {
        let top_puck = Rect::new(100, 0, PUCK.width, PUCK.height);
        let bottom_puck = Rect::new(100, 1_000, PUCK.width, PUCK.height);

        assert_eq!(panel_position(top_puck, PANEL, WORK_AREA).y, 0);
        assert_eq!(panel_position(bottom_puck, PANEL, WORK_AREA).y, 320);
    }

    #[test]
    fn respects_negative_multi_monitor_coordinates() {
        let work_area = Rect::new(-1_920, -40, 1_920, 1_040);
        let puck = Rect::new(-1_910, 300, PUCK.width, PUCK.height);
        let position = panel_position(puck, PANEL, work_area);

        assert_eq!(position.x, -1_840);
        assert!(position.y >= work_area.y);
        assert!(position.x + PANEL.width as i32 <= work_area.right());
        assert!(position.y + PANEL.height as i32 <= work_area.bottom());
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
}
