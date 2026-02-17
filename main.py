import warnings
warnings.filterwarnings("ignore")
import cv2
import numpy as np
import time
import os

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

import mediapipe as mp

mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils

hands = mp_hands.Hands(min_detection_confidence=0.7, min_tracking_confidence=0.5, max_num_hands=1)

WIDTH, HEIGHT = 1280, 720
ERASER_THICKNESS = 50
DRAW_THICKNESS = 15
BRUSH_MIN = 4
BRUSH_MAX = 40


COLOR_DEBOUNCE_SECONDS = 0.3  
POINT_SMOOTHING_ALPHA = 0.5 
THICKNESS_SMOOTHING_ALPHA = 0.25

draw_color = (255, 0, 0)  
brush_thickness = DRAW_THICKNESS
canvas = None
prev_x, prev_y = 0, 0
fist_start_time = 0
eraser_mode_active = False
last_color_change_time = 0
curr_finger_count = 0


COLORS = {
    5: (0, 255, 0),    
    4: (255, 255, 255),
    3: (0, 0, 255),    
    2: (0, 0, 0),      
    1: (255, 0, 0),    
}

COLOR_NAMES = {
    (0, 255, 0): "Green",
    (255, 255, 255): "White",
    (0, 0, 255): "Red",
    (0, 0, 0): "Black",
    (255, 0, 0): "Blue"
}


def count_fingers(landmarks, hand_label="Right"):
    """
    Count raised fingers and return the count and status of each finger.
    hand_label: 'Right' or 'Left' as reported by MediaPipe (for the mirrored image).
    """
    tips = [4, 8, 12, 16, 20] 
    fingers = []
    
    
    
    thumb_tip_x = landmarks[tips[0]].x
    thumb_ip_x = landmarks[tips[0] - 1].x
    
    
    
    
    
    
    
    
    
    
    
    
    

    if hand_label == "Right": 
        
        if thumb_tip_x < thumb_ip_x:
            fingers.append(1)
        else:
            fingers.append(0)
    else: 
        
        if thumb_tip_x > thumb_ip_x:
            fingers.append(1)
        else:
            fingers.append(0)

    
    
    for id in range(1, 5):
        if landmarks[tips[id]].y < landmarks[tips[id] - 2].y:
            fingers.append(1)
        else:
            fingers.append(0)

    return fingers.count(1), fingers

def overlay_canvas(frame, canvas):
    gray = cv2.cvtColor(canvas, cv2.COLOR_BGR2GRAY)
    _, inv = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY_INV)
    inv = cv2.cvtColor(inv, cv2.COLOR_GRAY2BGR)
    frame = cv2.bitwise_and(frame, inv)
    frame = cv2.bitwise_or(frame, canvas)
    return frame

def main():
    global canvas

    cap = cv2.VideoCapture(0)
    cap.set(3, WIDTH)
    cap.set(4, HEIGHT)
    
    
    canvas = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    
    
    cv2.namedWindow("Air Draw System", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("Air Draw System", WIDTH, HEIGHT)
    
    p_time = 0

    
    prev_x, prev_y = 0, 0
    filtered_x, filtered_y = None, None
    filtered_thickness = float(DRAW_THICKNESS)

    selected_color = (255, 0, 0)  
    draw_color = selected_color
    brush_thickness = DRAW_THICKNESS
    thickness_scale = 1.0

    
    last_color_change_time = 0.0
    color_candidate = None
    color_candidate_since = 0.0

    
    fist_start_time = 0.0
    eraser_mode_active = False

    
    curr_mode = "IDLE"  
    tool_mode = "FREE"  
    shape_active = False
    shape_start = None
    shape_end = None
    was_drawing_gesture = False

    while True:
        success, frame = cap.read()
        if not success:
            break

        
        frame = cv2.flip(frame, 1)
        h, w, c = frame.shape
        
        
        img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(img_rgb)
        
        
        curr_finger_count = 0
        drawing_gesture = False
        erasing_gesture = False
        now = time.time()
        
        if results.multi_hand_landmarks and results.multi_handedness:
            for idx, hand_lms in enumerate(results.multi_hand_landmarks):
                hand_label = results.multi_handedness[idx].classification[0].label
                
                
                mp_draw.draw_landmarks(frame, hand_lms, mp_hands.HAND_CONNECTIONS)
                
                lm_list = []
                
                for id, lm in enumerate(hand_lms.landmark):
                    cx, cy = int(lm.x * w), int(lm.y * h)
                    lm_list.append((cx, cy))
                
                if lm_list:
                    
                    
                    count, fingers = count_fingers(hand_lms.landmark, hand_label)
                    curr_finger_count = count

                    
                    x1, y1 = lm_list[8]  
                    x2, y2 = lm_list[4]  

                    
                    if filtered_x is None or filtered_y is None:
                        filtered_x, filtered_y = x1, y1
                    else:
                        filtered_x = int(POINT_SMOOTHING_ALPHA * x1 + (1 - POINT_SMOOTHING_ALPHA) * filtered_x)
                        filtered_y = int(POINT_SMOOTHING_ALPHA * y1 + (1 - POINT_SMOOTHING_ALPHA) * filtered_y)

                    
                    pinch_dist = float(np.hypot(x2 - x1, y2 - y1))
                    pinch_thickness = float(np.interp(pinch_dist, [20.0, 220.0], [BRUSH_MIN, BRUSH_MAX]))
                    pinch_thickness = max(float(BRUSH_MIN), min(float(BRUSH_MAX), pinch_thickness))
                    target_thickness = pinch_thickness * float(thickness_scale)
                    filtered_thickness = (
                        THICKNESS_SMOOTHING_ALPHA * target_thickness
                        + (1 - THICKNESS_SMOOTHING_ALPHA) * filtered_thickness
                    )
                    brush_thickness = int(max(BRUSH_MIN, min(BRUSH_MAX, round(filtered_thickness))))

                    
                    
                    
                    if count == 0:
                        curr_mode = "ERASER"
                        erasing_gesture = True
                        if not eraser_mode_active:
                            eraser_mode_active = True
                            fist_start_time = now
                        
                        
                        cv2.circle(frame, (filtered_x, filtered_y), ERASER_THICKNESS, (0, 0, 0), -1)
                        cv2.circle(frame, (filtered_x, filtered_y), ERASER_THICKNESS, (150, 150, 150), 2)
                        cv2.putText(frame, "ERASER MODE", (filtered_x, filtered_y - 60), cv2.FONT_HERSHEY_PLAIN, 2, (0, 0, 255), 2)
                        
                        
                        cv2.circle(canvas, (filtered_x, filtered_y), ERASER_THICKNESS, (0, 0, 0), -1)
                        
                        
                        if now - fist_start_time > 2.0:
                            canvas = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
                            cv2.putText(frame, "CANVAS CLEARED", (WIDTH//2 - 200, HEIGHT//2), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 255), 3)

                        prev_x, prev_y = 0, 0

                    
                    elif count == 1 and fingers[1] == 1:
                        curr_mode = "DRAWING"
                        drawing_gesture = True
                        eraser_mode_active = False

                        
                        draw_color = selected_color

                        if prev_x == 0 and prev_y == 0:
                            prev_x, prev_y = filtered_x, filtered_y

                        if tool_mode == "FREE":
                            cv2.line(canvas, (prev_x, prev_y), (filtered_x, filtered_y), draw_color, brush_thickness)
                            prev_x, prev_y = filtered_x, filtered_y
                        else:
                            
                            if not shape_active:
                                shape_active = True
                                shape_start = (filtered_x, filtered_y)
                                shape_end = (filtered_x, filtered_y)
                            else:
                                shape_end = (filtered_x, filtered_y)
                    
                    
                    else:
                        prev_x, prev_y = 0, 0
                        eraser_mode_active = False
                        curr_mode = "SELECTING"

                        
                        if count in (2, 3, 4, 5):
                            if color_candidate != count:
                                color_candidate = count
                                color_candidate_since = now
                            else:
                                elapsed = now - color_candidate_since
                                if (
                                    elapsed >= COLOR_DEBOUNCE_SECONDS
                                    and (now - last_color_change_time) >= COLOR_DEBOUNCE_SECONDS
                                ):
                                    selected_color = COLORS[count]
                                    draw_color = selected_color
                                    last_color_change_time = now
                                    
                                    cv2.rectangle(frame, (filtered_x - 20, filtered_y - 20), (filtered_x + 20, filtered_y + 20), selected_color, -1)
                                else:
                                    
                                    progress = int((elapsed / COLOR_DEBOUNCE_SECONDS) * 360)
                                    cv2.ellipse(frame, (filtered_x, filtered_y), (30, 30), 0, 0, progress, COLORS[count], 5)
                                    cv2.putText(frame, "Hold...", (filtered_x - 30, filtered_y - 40), cv2.FONT_HERSHEY_PLAIN, 1, COLORS[count], 2)
                        else:
                            color_candidate = None

                        cv2.circle(frame, (filtered_x, filtered_y), 15, selected_color, -1)
                        if selected_color == (0, 0, 0):
                            cv2.circle(frame, (filtered_x, filtered_y), 15, (255, 255, 255), 1)

        
        if was_drawing_gesture and not drawing_gesture:
            if shape_active and tool_mode != "FREE" and shape_start is not None and shape_end is not None:
                x_start, y_start = shape_start
                x_end, y_end = shape_end
                if tool_mode == "LINE":
                    cv2.line(canvas, (x_start, y_start), (x_end, y_end), selected_color, brush_thickness)
                elif tool_mode == "RECT":
                    cv2.rectangle(canvas, (x_start, y_start), (x_end, y_end), selected_color, brush_thickness)
                elif tool_mode == "CIRCLE":
                    radius = int(np.hypot(x_end - x_start, y_end - y_start))
                    cv2.circle(canvas, (x_start, y_start), radius, selected_color, brush_thickness)

            shape_active = False
            shape_start = None
            shape_end = None

        
        if drawing_gesture or erasing_gesture:
            color_candidate = None

        was_drawing_gesture = drawing_gesture

        
        frame = overlay_canvas(frame, canvas)

        
        if shape_active and tool_mode != "FREE" and shape_start is not None and shape_end is not None:
            x_start, y_start = shape_start
            x_end, y_end = shape_end
            preview_color = selected_color
            if tool_mode == "LINE":
                cv2.line(frame, (x_start, y_start), (x_end, y_end), preview_color, max(1, brush_thickness))
            elif tool_mode == "RECT":
                cv2.rectangle(frame, (x_start, y_start), (x_end, y_end), preview_color, max(1, brush_thickness))
            elif tool_mode == "CIRCLE":
                radius = int(np.hypot(x_end - x_start, y_end - y_start))
                cv2.circle(frame, (x_start, y_start), radius, preview_color, max(1, brush_thickness))
        
        
        cv2.rectangle(frame, (0,0), (WIDTH, 100), (50, 50, 50), -1)
        
        
        curr_color_name = "Custom"
        for c_val, name in COLOR_NAMES.items():
            if c_val == selected_color:
                curr_color_name = name
                break
                
        cv2.putText(frame, f"Color: {curr_color_name}", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, selected_color, 2)
        cv2.circle(frame, (250, 40), 20, selected_color, -1)
        if selected_color == (0,0,0):
            cv2.circle(frame, (250, 40), 20, (255, 255, 255), 1)

        
        cv2.putText(frame, f"Tool: {tool_mode}", (320, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (220, 220, 220), 2)
        cv2.putText(frame, f"Thickness: {brush_thickness}", (320, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (220, 220, 220), 2)

        
        cv2.putText(frame, f"Mode: {curr_mode}", (WIDTH - 400, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
        cv2.putText(frame, f"Fingers: {curr_finger_count}", (WIDTH - 400, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
        
        
        c_time = time.time()
        fps = 1 / (c_time - p_time) if c_time - p_time > 0 else 0
        p_time = c_time
        cv2.putText(frame, f"FPS: {int(fps)}", (WIDTH - 150, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

        cv2.imshow("Air Draw System", frame)
        
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('c'):
            canvas = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
        elif key == ord('s'):
            filename = f"drawing_{int(time.time())}.png"
            cv2.imwrite(filename, canvas)
            print(f"Saved {filename}")
        elif key == ord('f'):
            tool_mode = "FREE"
        elif key == ord('l'):
            tool_mode = "LINE"
        elif key == ord('r'):
            tool_mode = "RECT"
        elif key == ord('o'):
            tool_mode = "CIRCLE"
        elif key in (ord('+'), ord('=')):
            thickness_scale = min(2.5, thickness_scale + 0.1)
        elif key in (ord('-'), ord('_')):
            thickness_scale = max(0.5, thickness_scale - 0.1)

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
