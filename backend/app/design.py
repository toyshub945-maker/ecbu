"""
A+ Content Design Tool backend.
Gemini 1.5 Flash multimodal analysis + Pillow image stitching.
"""
from __future__ import annotations
import base64
import io
import json
import os
import re
import tempfile
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

router = APIRouter()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# ─── Prompt ────────────────────────────────────────────────────────────────────

_ANALYSIS_PROMPT = """You are an expert E-commerce visual merchandiser AND quality-control specialist for footwear brands.

I will give you:
  • {n} product module images (labeled module_1 … module_{n})
  • 1 size-chart image (labeled size_chart)
  • Marketing copy / product wordings shown below

═══ WORDINGS ═══
{wordings}
════════════════

YOUR TASKS:

1. LAYOUT SEQUENCING
   Determine the optimal vertical order for the modules (size_chart ALWAYS last).
   Typical high-conversion flow: Hero Shot → Key Feature → Detail/Texture Close-up → Colour Variants → Size Chart.

2. OCR PROOFREADING
   Read every word visible in each image. Compare against the Wordings above.
   Flag any of these issues:
     - typo          : spelling error or wrong word in image vs wordings
     - color_mismatch: image shows a different colour than wordings state
     - material_mismatch: image says "Synthetic" but wordings say "Genuine Leather" (or vice-versa)
     - category_mismatch: wrong size chart for this product type / gender
     - font_inconsistency: visually different font style from the rest of the set

3. OUTPUT — return ONLY a valid JSON object, no markdown, no explanation:
{
  "optimized_order": ["module_1","module_3","module_2","module_4","module_5","size_chart"],
  "proofreading_report": {
    "status": "pass",
    "issues": [
      {
        "module": "module_2",
        "type": "color_mismatch",
        "description": "Image shows 'Navy Blue' but wordings state 'Royal Blue'.",
        "severity": "warning"
      }
    ]
  }
}

severity levels: "critical" (must fix before publishing) | "warning" (review recommended) | "info" (minor observation)
If no issues found, return "status":"pass" with an empty "issues" array.
"""


# ─── Gemini helper ─────────────────────────────────────────────────────────────

def _to_inline(img_bytes: bytes, mime: str = "image/jpeg") -> dict:
    return {"inline_data": {"mime_type": mime, "data": base64.b64encode(img_bytes).decode()}}


def _detect_mime(filename: str) -> str:
    ext = (filename or "").lower().rsplit(".", 1)[-1]
    return {"png": "image/png", "webp": "image/webp", "gif": "image/gif"}.get(ext, "image/jpeg")


async def _analyze_with_gemini(
    module_bytes: list[tuple[bytes, str]],   # (bytes, filename)
    size_chart_bytes: bytes,
    size_chart_name: str,
    wordings: str,
) -> dict:
    if not GEMINI_API_KEY:
        raise HTTPException(500, "GEMINI_API_KEY not configured on the server.")

    try:
        import google.generativeai as genai
    except ImportError:
        raise HTTPException(500, "google-generativeai package not installed.")

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-1.5-flash")

    n = len(module_bytes)
    prompt_text = _ANALYSIS_PROMPT.format(n=n, wordings=wordings.strip())

    parts: list = [prompt_text]
    for img_b, fname in module_bytes:
        parts.append(_to_inline(img_b, _detect_mime(fname)))
    parts.append(_to_inline(size_chart_bytes, _detect_mime(size_chart_name)))

    try:
        response = model.generate_content(parts)
        raw = response.text.strip()

        # Strip markdown code fence if present
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```$", "", raw)

        return json.loads(raw.strip())

    except json.JSONDecodeError:
        # Graceful fallback — default order, warn user
        return {
            "optimized_order": [f"module_{i+1}" for i in range(n)] + ["size_chart"],
            "proofreading_report": {
                "status": "warning",
                "issues": [{
                    "module": "all",
                    "type": "info",
                    "description": "AI returned an unparseable response. Default order applied — please verify manually.",
                    "severity": "info",
                }],
            },
        }
    except Exception as e:
        raise HTTPException(500, f"Gemini API error: {e}")


# ─── Image stitcher ────────────────────────────────────────────────────────────

def _stitch(ordered_bytes: list[bytes], target_width: int = 970) -> bytes:
    try:
        from PIL import Image
    except ImportError:
        raise HTTPException(500, "Pillow not installed.")

    pil_imgs = []
    for b in ordered_bytes:
        img = Image.open(io.BytesIO(b)).convert("RGB")
        w, h = img.size
        new_h = max(1, round(target_width * h / w))
        pil_imgs.append(img.resize((target_width, new_h), Image.LANCZOS))

    total_h = sum(im.height for im in pil_imgs)
    strip = Image.new("RGB", (target_width, total_h), (255, 255, 255))
    y = 0
    for im in pil_imgs:
        strip.paste(im, (0, y))
        y += im.height

    buf = io.BytesIO()
    strip.save(buf, format="JPEG", quality=95, optimize=True)
    return buf.getvalue()


# ─── Routes ────────────────────────────────────────────────────────────────────

@router.post("/api/design/analyze")
async def analyze_design(
    size_chart: UploadFile = File(...),
    modules: list[UploadFile] = File(...),
    wordings: str = Form(...),
):
    """
    Multimodal Gemini analysis:
    - Optimal layout order
    - OCR proofreading vs provided wordings
    Returns JSON with optimized_order + proofreading_report.
    """
    if not modules:
        raise HTTPException(400, "Upload at least 1 module image.")
    if len(modules) > 5:
        raise HTTPException(400, "Maximum 5 module images allowed.")

    sc_bytes = await size_chart.read()
    mod_tuples = [(await m.read(), m.filename or f"module_{i+1}.jpg")
                  for i, m in enumerate(modules)]

    result = await _analyze_with_gemini(
        mod_tuples, sc_bytes, size_chart.filename or "size_chart.jpg", wordings
    )
    # Attach original filenames so the frontend can map them
    result["module_filenames"] = [m.filename for m in modules]
    result["size_chart_filename"] = size_chart.filename
    return JSONResponse(content=result)


@router.post("/api/design/stitch")
async def stitch_design(
    images: list[UploadFile] = File(...),
    target_width: int = Form(default=970),
):
    """
    Stitch uploaded images (in order) into a single vertical A+ strip.
    Returns a JPEG file.
    """
    if not images:
        raise HTTPException(400, "No images provided.")
    if target_width < 200 or target_width > 4000:
        raise HTTPException(400, "target_width must be between 200 and 4000.")

    ordered_bytes = [await img.read() for img in images]
    strip_bytes = _stitch(ordered_bytes, target_width)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    tmp.write(strip_bytes)
    tmp.close()

    return FileResponse(
        path=tmp.name,
        filename="aplus_strip.jpg",
        media_type="image/jpeg",
    )
