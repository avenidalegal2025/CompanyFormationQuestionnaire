"""
Lambda: Ensure Airtable Formations table has all required document URL fields.
Creates any missing fields via Airtable Metadata API so the app stops getting UNKNOWN_FIELD_NAME.
Run on deploy or invoke manually. Requires AIRTABLE_API_KEY and AIRTABLE_BASE_ID in env (or from SSM).
"""

import os
import json
import urllib.request
import urllib.error

TABLE_NAME = "Formations"

# Exact field names the app writes to (must exist on Formations table)
REQUIRED_DOCUMENT_URL_FIELDS = [
    "Membership Registry URL",
    "Organizational Resolution URL",
    "Operating Agreement URL",
    "Shareholder Registry URL",
    "Bylaws URL",
    "SS-4 URL",
    "2848 URL",
    "8821 URL",
]


def get_table_id(base_id: str, api_key: str) -> str:
    req = urllib.request.Request(
        f"https://api.airtable.com/v0/meta/bases/{base_id}/tables",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
    for t in data.get("tables", []):
        if t.get("name") == TABLE_NAME:
            return t["id"]
    raise ValueError(f'Table "{TABLE_NAME}" not found in base')


def get_existing_field_names(base_id: str, table_id: str, api_key: str) -> list:
    req = urllib.request.Request(
        f"https://api.airtable.com/v0/meta/bases/{base_id}/tables/{table_id}",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
    return [f["name"] for f in data.get("fields", [])]


def create_field(base_id: str, table_id: str, field_name: str, api_key: str) -> dict:
    body = json.dumps({"name": field_name, "type": "url"}).encode()
    req = urllib.request.Request(
        f"https://api.airtable.com/v0/meta/bases/{base_id}/tables/{table_id}/fields",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def lambda_handler(event, context):
    api_key = os.environ.get("AIRTABLE_API_KEY")
    base_id = os.environ.get("AIRTABLE_BASE_ID")
    if not api_key or not base_id:
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": "Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID in Lambda environment",
            }),
        }

    try:
        table_id = get_table_id(base_id, api_key)
        existing = get_existing_field_names(base_id, table_id, api_key)
        missing = [f for f in REQUIRED_DOCUMENT_URL_FIELDS if f not in existing]
        created = []
        errors = []

        for field_name in missing:
            try:
                create_field(base_id, table_id, field_name, api_key)
                created.append(field_name)
            except urllib.error.HTTPError as e:
                body = e.read().decode() if e.fp else ""
                errors.append(f"{field_name}: {e.code} {body}")
            except Exception as e:
                errors.append(f"{field_name}: {str(e)}")

        return {
            "statusCode": 200,
            "body": json.dumps({
                "table": TABLE_NAME,
                "tableId": table_id,
                "created": created,
                "alreadyExisted": [f for f in REQUIRED_DOCUMENT_URL_FIELDS if f in existing],
                "errors": errors if errors else None,
            }),
        }
    except ValueError as e:
        return {
            "statusCode": 404,
            "body": json.dumps({"error": str(e)}),
        }
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return {
            "statusCode": e.code,
            "body": json.dumps({"error": f"Airtable API error: {e.code} {body}"}),
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }
