"""PDF thumbnail generation - one capability of pariksha-doc-processing, the
service that owns anything document-heavy (PDF, DOC, Excel, ...) so the main
API Lambda (pariksha-backend) never has to carry those dependencies. This
one renders a real first-page thumbnail for every PDF uploaded to the Paper
Vault, triggered by S3 ObjectCreated events.

Flow: /library upload (main backend) -> PDF lands in the library bucket ->
this function fires -> renders page 1 -> uploads the PNG to the public
bank-images bucket -> writes thumbnailUrl onto the matching DynamoDB item.
"""
import os
import time
import urllib.parse

import boto3
import pymupdf

s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "ap-south-1"))
dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-south-1"))

LIBRARY_TABLE = os.environ["LIBRARY_TABLE"]
BANK_IMAGES_BUCKET = os.environ["BANK_IMAGES_BUCKET"]
AWS_REGION = os.environ.get("AWS_REGION", "ap-south-1")

library_table = dynamodb.Table(LIBRARY_TABLE)


def _parse_library_key(key: str) -> tuple[str, str, str] | None:
    # Keys are written by pariksha-backend's _library_key() as
    # "{email}/{itemId}/{fileName}".
    parts = key.split("/", 2)
    if len(parts) != 3:
        return None
    email, item_id, file_name = parts
    return email, item_id, file_name


def _render_thumbnail(pdf_bytes: bytes) -> bytes:
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    zoom = min(2.0, 480 / page.rect.width)
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
    return pix.tobytes("png")


def _update_with_retry(email: str, item_id: str, thumbnail_url: str) -> bool:
    # The /library upload handler writes the S3 object(s) before the
    # DynamoDB item, so this event can briefly arrive before the item
    # exists - a short retry window comfortably covers that race.
    for attempt in range(5):
        existing = library_table.get_item(Key={"userId": email, "itemId": item_id}).get("Item")
        if existing:
            library_table.update_item(
                Key={"userId": email, "itemId": item_id},
                UpdateExpression="SET thumbnailUrl = :t",
                ExpressionAttributeValues={":t": thumbnail_url},
            )
            return True
        time.sleep(1.5 * (attempt + 1))
    return False


def handle(event, context):
    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])

        parsed = _parse_library_key(key)
        if not parsed:
            continue
        email, item_id, file_name = parsed
        if not file_name.lower().endswith(".pdf"):
            continue

        obj = s3.get_object(Bucket=bucket, Key=key)
        pdf_bytes = obj["Body"].read()

        try:
            png = _render_thumbnail(pdf_bytes)
        except Exception as e:
            print(f"Thumbnail render failed for {key}: {e}")
            continue

        thumb_key = f"thumbnails/{email}/{item_id}.png"
        s3.put_object(Bucket=BANK_IMAGES_BUCKET, Key=thumb_key, Body=png, ContentType="image/png")
        thumbnail_url = f"https://{BANK_IMAGES_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{thumb_key}"

        if not _update_with_retry(email, item_id, thumbnail_url):
            print(f"Library item {item_id} never appeared for {email} - thumbnail uploaded but not linked.")

    return {"ok": True}
