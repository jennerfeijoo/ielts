# IELTS Simulator (GitHub Pages)

A static, GitHub Pages–compatible IELTS practice simulator with:
- Listening + Reading auto-marking (answer sheet style)
- Writing workspace (timer + word count)
- Speaking prompts + optional local audio recording

## Why “answer sheet style”?
To avoid copying full test content into JSON, the simulator focuses on:
- Accurate timing
- Exam-like navigation
- Robust auto-marking using official answer keys
- Side-by-side PDF/audio usage (embedded or loaded locally)

You can still upload the original PDFs/MP3s into this private repository under `assets/`.

## Deploy on GitHub Pages
1. Push this repo to GitHub.
2. Settings → Pages → Deploy from branch (e.g., `main`), root folder.
3. Open the provided Pages URL.

## Add your PDF + audio
- Put the test PDF as: `assets/pdfs/test1.pdf`
- Put listening audio files as:
  - `assets/audio/test1/part1.mp3`
  - `assets/audio/test1/part2.mp3`
  - `assets/audio/test1/part3.mp3`
  - `assets/audio/test1/part4.mp3`

Alternatively, on each module page you can load a local PDF/MP3 via the file inputs (nothing is uploaded; it stays in your browser).

## Add more tests (you have 12)
1. Create:
   - `data/listening/test2.json`, `data/reading/test2.json`, etc.
2. Add them to `data/manifest.json`:
```json
{
  "listening": [{"id":"test1","title":"Test 1","path":"data/listening/test1.json"}, ...],
  "reading":   [{"id":"test1","title":"Test 1","path":"data/reading/test1.json"}, ...]
}
```

## Answer key format
- Single-answer questions:
```json
"10": { "type": "single", "accepted": ["35","thirty five","thirty-five"], "weight": 1 }
```
- Multi-letter (choose TWO, either order):
```json
"15-16": { "type": "multi_letter", "acceptedSet": ["A","D"], "expectedCount": 2, "weight": 2 }
```

## Auto-save / Reset
- Auto-save uses browser `localStorage`.
- Reset clears answers for the current module+test only.

