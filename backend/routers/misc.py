import shutil
import requests
from bs4 import BeautifulSoup
from fastapi import APIRouter, UploadFile, File
from database import UPLOAD_DIR

router = APIRouter(tags=["misc"])


@router.get("/api/preview")
def get_link_preview(url: str):
    try:
        headers = {"User-Agent": "Mozilla/5.0"}
        response = requests.get(url, headers=headers, timeout=5)
        soup = BeautifulSoup(response.text, "html.parser")
        title_tag = soup.find("meta", property="og:title")
        title = title_tag["content"] if title_tag else (soup.title.string if soup.title else url)
        img_tag = soup.find("meta", property="og:image")
        image = img_tag["content"] if img_tag else None
        desc_tag = soup.find("meta", property="og:description")
        description = desc_tag["content"] if desc_tag else ""
        return {"title": title, "image": image, "description": description, "url": url}
    except Exception:
        return {"title": url, "image": None, "description": "Preview not available", "url": url}


@router.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    file_location = f"{UPLOAD_DIR}/{file.filename}"
    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"filename": file.filename, "url": f"http://127.0.0.1:8000/uploads/{file.filename}"}
