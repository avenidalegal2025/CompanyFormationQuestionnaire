import os
import time
import random
import json
import subprocess
import io
import tkinter as tk
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.firefox import GeckoDriverManager
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# ==== CONFIG ====
SERVICE_ACCOUNT_FILE = 'sunbiz-automation-463903-75e530b1c4a5.json'
FOLDER_ID = '1fWz_DtNdANv6eFbpFQfxg3LwvH5aDIIy'
LOCAL_JSON_FILENAME = 'form_data.json'
PAYMENT_JSON_FILENAME = 'payment.json'
SCREENSHOT_PATH = 'llc_name_check.png'

# ==== UTILITIES ====
def kill_processes(process_names):
    for name in process_names:
        subprocess.run(['pkill', '-f', name], check=False)

def human_typing(element, text, min_delay=0.03, max_delay=0.12):
    for char in text:
        element.send_keys(char)
        time.sleep(random.uniform(min_delay, max_delay))

def download_json_from_gdrive(service_account_file, folder_id, output_path):
    creds = service_account.Credentials.from_service_account_file(
        service_account_file,
        scopes=["https://www.googleapis.com/auth/drive"]
    )
    service = build('drive', 'v3', credentials=creds)
    results = service.files().list(
        q=f"'{folder_id}' in parents and name contains '.json.txt'",
        pageSize=1,
        orderBy="createdTime desc",
        fields="files(id, name, createdTime)"
    ).execute()
    items = results.get('files', [])
    if not items:
        raise FileNotFoundError("No JSON files found in Drive folder.")
    file_id = items[0]['id']
    print(f"📂 Using file: {items[0]['name']} created at {items[0]['createdTime']}")
    request = service.files().get_media(fileId=file_id)
    fh = io.FileIO(output_path, 'wb')
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while not done:
        status, done = downloader.next_chunk()
    fh.close()
    print(f"✅ Downloaded JSON to {output_path}")

def init_browser():
    kill_processes(['firefox', 'geckodriver'])
    options = Options()
    options.headless = False
    service = FirefoxService(GeckoDriverManager().install())
    return webdriver.Firefox(service=service, options=options)

def show_popup_and_exit(message, duration=5):
    root = tk.Tk()
    root.title("LLC Name Check Failed")
    root.geometry("400x100")
    root.eval('tk::PlaceWindow . center')
    label = tk.Label(root, text=message, font=("Helvetica", 12))
    label.pack(expand=True)
    root.after(duration * 1000, root.destroy)
    root.mainloop()

def check_llc_availability(driver, wait, llc_name):
    driver.get("https://search.sunbiz.org/inquiry/corporationsearch/byname")
    human_typing(wait.until(EC.presence_of_element_located((By.ID, "SearchTerm"))), llc_name.upper())
    wait.until(EC.element_to_be_clickable((By.XPATH, "//input[@type='submit' and @value='Search Now']"))).click()
    time.sleep(5)
    driver.save_screenshot(SCREENSHOT_PATH)
    print(f"📸 Screenshot saved to {SCREENSHOT_PATH}")
    body_text = driver.find_element(By.TAG_NAME, "body").text.upper()
    if "ACTIVE" in body_text or "INACT" in body_text or llc_name.upper() in body_text:
        show_popup_and_exit(f"❌ '{llc_name}' is NOT available.\nFiling stopped.")
        driver.quit()
        kill_processes(['firefox', 'geckodriver'])
        exit()

# ==== MAIN SCRIPT ====
def main():
    download_json_from_gdrive(SERVICE_ACCOUNT_FILE, FOLDER_ID, LOCAL_JSON_FILENAME)

    with open(LOCAL_JSON_FILENAME) as f:
        data = json.load(f)
    with open(PAYMENT_JSON_FILENAME) as f:
        payment = json.load(f)

    driver = init_browser()
    wait = WebDriverWait(driver, 30)

    try:
        llc = data.get("llc", data)
        check_llc_availability(driver, wait, llc["name"])

        # (Filing logic follows here… same as previous script)

    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        input("Press Enter to close the browser...")
        driver.quit()
        kill_processes(['firefox', 'geckodriver'])

if __name__ == "__main__":
    main()