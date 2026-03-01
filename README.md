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

---

## Web (Run On A Domain)

This repo also includes a browser-based version in [web/](web/) that runs directly in the browser using the webcam.

Important:
- Browsers only allow webcam access on **HTTPS** (or `http://localhost`).

### Run locally

From the repo root:

```bash
python3 -m http.server 8000
```

Then open:
- `http://localhost:8000/web/`

### Deploy to a domain

Any static hosting works. Configure the host to publish the `web/` folder.

- **Netlify**: set *Publish directory* to `web`
- **Vercel**: set *Root Directory* to `web` (or deploy as a static site)
- **GitHub Pages**: easiest is to deploy the `web/` folder via a Pages workflow (or move/copy `web/` contents into `/docs` and set Pages to `/docs`).

Once deployed, open your domain and click **Start camera**.

Note (macOS Apple Silicon): you may see one-time Objective-C warnings about duplicate OpenCV classes when importing MediaPipe + OpenCV together. The app should still run; if you ever see random crashes, tell me and I’ll help you apply a stricter workaround.

## Controls

- **Gestures**: Use your hand gestures to control modes.
- **Keyboard**:
    - `Q`: Quit
    - `C`: Clear Canvas
    - `S`: Save Drawing
    - `F`: Free draw tool
    - `L`: Line tool
    - `R`: Rectangle tool
    - `O`: Circle tool
    - `+` / `-`: Increase / decrease brush thickness sensitivity
