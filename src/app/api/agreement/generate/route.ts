import { NextRequest, NextResponse } from "next/server";
import { mapFormToDocgenAnswers } from "@/lib/agreement-mapper";
import { generateDocument } from "@/lib/agreement-docgen";
import { uploadAgreementDocument } from "@/lib/agreement-s3";
import { syncToAirtable, type AgreementSyncData } from "@/lib/agreement-airtable";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { formData, draftId } = body;

    if (!formData) {
      return NextResponse.json(
        { error: "Missing formData" },
        { status: 400 }
      );
    }

    // 1. Map form fields to the docgen interface
    const answers = mapFormToDocgenAnswers(formData);

    if (!answers.entity_type || !answers.entity_name) {
      return NextResponse.json(
        { error: "Entity type and name are required" },
        { status: 400 }
      );
    }

    // 2. Generate the DOCX document
    const { buffer, filename } = await generateDocument(answers);

    // 3. Upload to S3
    let s3Key = "";
    let downloadUrl = "";
    try {
      const uploadId = draftId || crypto.randomUUID();
      const result = await uploadAgreementDocument(uploadId, filename, buffer);
      s3Key = result.s3Key;
      downloadUrl = result.downloadUrl;
    } catch (s3Err) {
      console.error("S3 upload failed:", s3Err);
      // Continue — we can still return the document for direct download
    }

    // 4. Sync to Airtable (fire-and-forget)
    const syncData: AgreementSyncData = {
      session_id: draftId || "direct-gen",
      entity_type: answers.entity_type,
      entity_name: answers.entity_name,
      state_of_formation: answers.state_of_formation,
      county: answers.county,
      management_type: answers.management_type,
      sale_of_company_voting: answers.sale_of_company_voting,
      major_decisions_voting: answers.major_decisions_voting,
      dissolution_voting: answers.dissolution_voting,
      new_member_admission_voting: answers.new_member_admission_voting,
      officer_removal_voting: answers.officer_removal_voting,
      additional_capital_voting: answers.additional_capital_voting,
      shareholder_loans_voting: answers.shareholder_loans_voting,
      majority_threshold: answers.majority_threshold,
      supermajority_threshold: answers.supermajority_threshold,
      major_spending_threshold: answers.major_spending_threshold,
      bank_signees: answers.bank_signees,
      family_transfer: answers.family_transfer,
      right_of_first_refusal: answers.right_of_first_refusal,
      rofr_offer_period: answers.rofr_offer_period,
      death_incapacity_forced_sale: answers.death_incapacity_forced_sale,
      drag_along: answers.drag_along,
      tag_along: answers.tag_along,
      include_noncompete: answers.include_noncompete,
      noncompete_duration: answers.noncompete_duration,
      noncompete_scope: answers.noncompete_scope,
      include_nonsolicitation: answers.include_nonsolicitation,
      include_confidentiality: answers.include_confidentiality,
      distribution_frequency: answers.distribution_frequency,
      min_tax_distribution: answers.min_tax_distribution,
      status: "doc_generated",
      document_url: downloadUrl || undefined,
    };

    syncToAirtable(syncData).catch((err) =>
      console.error("Airtable sync failed:", err)
    );

    // 5. Return the document as a download
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        ...(s3Key ? { "X-S3-Key": s3Key } : {}),
        ...(downloadUrl ? { "X-Download-URL": downloadUrl } : {}),
      },
    });
  } catch (error) {
    console.error("Agreement generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate agreement", details: String(error) },
      { status: 500 }
    );
  }
}
