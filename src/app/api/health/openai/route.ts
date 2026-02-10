import { NextResponse } from 'next/server';

/**
 * GET /api/health/openai
 * Verifies OPENAI_API_KEY is set and valid (minimal API call).
 * Does not expose the key. Use for debugging SS-4 / LLM features.
 */
export async function GET() {
  const key = process.env.OPENAI_API_KEY?.trim() || '';
  if (!key) {
    return NextResponse.json(
      { ok: false, error: 'OPENAI_API_KEY is not set', configured: false },
      { status: 200 }
    );
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say OK' }],
        max_tokens: 5,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { ok: false, error: `OpenAI API error: ${res.status}`, details: err.slice(0, 200), configured: true },
        { status: 200 }
      );
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? '';
    return NextResponse.json({
      ok: true,
      configured: true,
      message: 'OpenAI key is valid',
      response: content.trim().slice(0, 50),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Request failed', configured: true },
      { status: 200 }
    );
  }
}
