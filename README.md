# Air Draw System

An AI-powered air drawing application using OpenCV and MediaPipe. Draw on the screen using hand gestures!

## Features

- **Draw with your finger**: Lift your index finger to draw.
- **Change Colors**: Raise different numbers of fingers to switch colors.
    - 5 Fingers: Green
    - 4 Fingers: White
    - 3 Fingers: Red
    - 2 Fingers: Black
    - 1 Finger: Blue (Drawing Mode)
- **Smart Eraser**: Make a fist (0 fingers) to activate the eraser.
    - Hold the fist for 2 seconds to clear the entire canvas.
- **Mirror Effect**: The camera feed is flipped for intuitive drawing.
- **Save & Clear**: Press `S` to save your art, `C` to clear the canvas manually.

## Installation

1. Create a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

Run the main script:
```bash
./.venv/bin/python main.py
```

Note (macOS Apple Silicon): you may see one-time Objective-C warnings about duplicate OpenCV classes when importing MediaPipe + OpenCV together. The app should still run; if you ever see random crashes, tell me and I’ll help you apply a stricter workaround.

## Controls

- **Gestures**: Use your hand gestures to control modes.
- **Keyboard**:
    - `Q`: Quit
    - `C`: Clear Canvas
    - `S`: Save Drawing
    - `P`: Toggle low-power mode
    - `F`: Free draw tool
    - `L`: Line tool
    - `R`: Rectangle tool
    - `O`: Circle tool
    - `+` / `-`: Increase / decrease brush thickness sensitivity

Extra gesture:
- **Thumbs-up hold (~1s)**: Toggle HUD/clean mode
