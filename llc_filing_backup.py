import os
import time
import random
import json
import subprocess
import io
import base64
from datetime import datetime

import boto3
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
S3_BUCKET = 'llc-filing-audit-trail-rodolfo'
REGION = 'us-west-1'

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

def fetch_payment_data_from_ssm(llc_name):
    ssm = boto3.client("ssm", region_name=REGION)
    response = ssm.get_parameter(Name="/llc/payment", WithDecryption=True)
    encoded = response['Parameter']['Value']
    decoded = base64.b64decode(encoded).decode('utf-8')
    payment_data = json.loads(decoded)
    with open("ssm_payment_dump.json", "w") as f:
        json.dump(payment_data, f, indent=2)
    upload_file_to_s3("ssm_payment_dump.json", llc_name, "payments")
    return payment_data

def upload_file_to_s3(filepath, llc_name, category):
    s3 = boto3.client("s3", region_name=REGION)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = os.path.basename(filepath)
    key = f"{llc_name}/{category}/{timestamp}_{filename}"
    try:
        s3.upload_file(filepath, S3_BUCKET, key)
        print(f"✅ Uploaded {filename} to s3://{S3_BUCKET}/{key}")
    except Exception as e:
        print(f"❌ Failed to upload {filename}: {e}")

def init_browser():
    kill_processes(['firefox', 'geckodriver'])
    options = Options()
    options.headless = False
    service = FirefoxService(GeckoDriverManager().install())
    return webdriver.Firefox(service=service, options=options)

# ==== MAIN SCRIPT ====
def main():
    download_json_from_gdrive(SERVICE_ACCOUNT_FILE, FOLDER_ID, LOCAL_JSON_FILENAME)

    with open(LOCAL_JSON_FILENAME) as f:
        data = json.load(f)

    llc = data.get("llc", data)
    llc_name = llc["name"].replace(" ", "_")
    payment = fetch_payment_data_from_ssm(llc_name)

    driver = init_browser()
    wait = WebDriverWait(driver, 30)

    try:
        driver.get("https://efile.sunbiz.org/llc_file.html")
        upload_file_to_s3(screenshot(driver, "start"), llc_name, "screenshots")

        wait.until(EC.element_to_be_clickable((By.ID, "disclaimer_read"))).click()
        wait.until(EC.element_to_be_clickable((By.XPATH, "//input[@value='Start New Filing']"))).click()
        time.sleep(2)

        # === LLC Info ===
        human_typing(wait.until(EC.presence_of_element_located((By.ID, "corp_name"))), llc["name"])
        human_typing(driver.find_element(By.ID, "princ_addr1"), llc["principal_address"]["line1"])
        human_typing(driver.find_element(By.ID, "princ_addr2"), llc["principal_address"]["line2"])
        human_typing(driver.find_element(By.ID, "princ_city"), llc["principal_address"]["city"])
        human_typing(driver.find_element(By.ID, "princ_st"), llc["principal_address"]["state"])
        human_typing(driver.find_element(By.ID, "princ_zip"), llc["principal_address"]["zip"])
        human_typing(driver.find_element(By.ID, "princ_cntry"), llc["principal_address"]["country"])
        driver.find_element(By.TAG_NAME, "body").click()
        time.sleep(1)
        driver.find_element(By.ID, "same_addr_flag").click()
        upload_file_to_s3(screenshot(driver, "llc_info"), llc_name, "screenshots")

        # === Registered Agent ===
        agent = data["registered_agent"]
        human_typing(driver.find_element(By.ID, "ra_name_last_name"), agent["last_name"])
        human_typing(driver.find_element(By.ID, "ra_name_first_name"), agent["first_name"])
        human_typing(driver.find_element(By.ID, "ra_addr1"), agent["address1"])
        human_typing(driver.find_element(By.ID, "ra_addr2"), agent["address2"])
        human_typing(driver.find_element(By.ID, "ra_city"), agent["city"])
        human_typing(driver.find_element(By.ID, "ra_zip"), agent["zip"])
        human_typing(driver.find_element(By.ID, "ra_signature"), agent["signature"])

        human_typing(driver.find_element(By.ID, "purpose"), llc["purpose"])

        contact = data["return_contact"]
        human_typing(driver.find_element(By.ID, "ret_name"), contact["name"])
        human_typing(driver.find_element(By.ID, "ret_email_addr"), contact["email"])
        human_typing(driver.find_element(By.ID, "email_addr_verify"), contact["email"])
        human_typing(driver.find_element(By.ID, "signature"), data["authorized_person"]["signature"])

        auth = data["authorized_person"]
        human_typing(driver.find_element(By.ID, "off1_name_title"), auth["title"])
        human_typing(driver.find_element(By.ID, "off1_name_last_name"), auth["last_name"])
        human_typing(driver.find_element(By.ID, "off1_name_first_name"), auth["first_name"])
        human_typing(driver.find_element(By.ID, "off1_name_addr1"), auth["address"])
        human_typing(driver.find_element(By.ID, "off1_name_city"), auth["city"])
        human_typing(driver.find_element(By.ID, "off1_name_st"), auth["state"])
        human_typing(driver.find_element(By.ID, "off1_name_zip"), auth["zip"])
        human_typing(driver.find_element(By.ID, "off1_name_cntry"), auth["country"])

        for i in range(3):
            wait.until(EC.element_to_be_clickable((By.XPATH, "//input[@type='submit' and @value='Continue']"))).click()
            time.sleep(2)
            try:
                WebDriverWait(driver, 2).until(EC.alert_is_present()).accept()
            except:
                pass

        wait.until(EC.element_to_be_clickable((By.XPATH, "//input[@type='submit' and @value='Credit Card Payment']"))).click()
        upload_file_to_s3(screenshot(driver, "payment_start"), llc_name, "screenshots")

        # === Payment ===
        human_typing(wait.until(EC.presence_of_element_located((By.ID, "CustomerInfo_FirstName"))), payment["pay_first"])
        human_typing(driver.find_element(By.ID, "CustomerInfo_LastName"), payment["pay_last"])
        human_typing(driver.find_element(By.ID, "CustomerInfo_Address1"), payment["pay_address"])
        human_typing(driver.find_element(By.ID, "CustomerInfo_City"), payment["pay_city"])
        Select(driver.find_element(By.ID, "CustomerInfo_State")).select_by_value(payment["pay_state"])
        human_typing(driver.find_element(By.ID, "CustomerInfo_Zip"), payment["pay_zip"])
        human_typing(driver.find_element(By.ID, "Phone"), payment["pay_phone"])
        human_typing(driver.find_element(By.ID, "Email"), payment["pay_email"])
        wait.until(EC.element_to_be_clickable((By.ID, "bntNextCustomerInfo"))).click()

        try:
            wait.until(EC.element_to_be_clickable((By.ID, "btn-address-verification"))).click()
        except:
            pass

        human_typing(driver.find_element(By.ID, "CCCardNumber"), payment["cc_number"])
        Select(driver.find_element(By.ID, "CCExpirationMonth")).select_by_value(payment["cc_exp_month"])
        Select(driver.find_element(By.ID, "CCExpirationYear")).select_by_value(payment["cc_exp_year"])
        human_typing(driver.find_element(By.ID, "CCCardCVV"), payment["cc_cvv"])
        human_typing(driver.find_element(By.ID, "CCNameOnCard"), payment["cc_name"])
        wait.until(EC.element_to_be_clickable((By.ID, "bntNextPaymentInfo"))).click()
        wait.until(EC.element_to_be_clickable((By.ID, "submitPayment"))).click()

        upload_file_to_s3(screenshot(driver, "final_confirmation"), llc_name, "screenshots")

    except Exception as e:
        print(f"❌ Error: {e}")
        with open("llc_error.log", "w") as log:
            log.write(str(e))
        upload_file_to_s3("llc_error.log", llc_name, "errors")
    finally:
        driver.quit()
        kill_processes(['firefox', 'geckodriver'])
        with open("run.log", "w") as log:
            log.write(f"LLC Name: {llc['name']}\n")
            log.write(f"Form File: {LOCAL_JSON_FILENAME}\n")
            log.write(f"Cardholder: {payment['cc_name']}\n")
        upload_file_to_s3("run.log", llc_name, "logs")

def screenshot(driver, label):
    filename = f"{label}.png"
    driver.save_screenshot(filename)
    return filename

if __name__ == "__main__":
    main()