// app/api/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBackendApiUrl } from '../../../lib/backend-url';

export async function POST(req: NextRequest) {
  let rawBody: unknown;

  try {
    const text = await req.text();
    rawBody = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: 'Request body is not valid JSON', code: null, previewHtml: null },
      { status: 400 }
    );
  }

  try {
    const backendRes = await fetch(getBackendApiUrl('/api/generate'), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rawBody),
    });
    
    // Log the raw response if it is not OK
    if (!backendRes.ok) {
        const errText = await backendRes.text();
        console.error("Backend Error:", errText);
        let parsedErr;
        try { parsedErr = JSON.parse(errText); } catch {}
        return NextResponse.json(parsedErr || { error: errText }, { status: backendRes.status });
    }

    const result = await backendRes.json();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Fetch Error:", message);
    return NextResponse.json({ error: "Backend error: " + message, code: null, previewHtml: null }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/generate',
    note: 'Proxies to backend',
  });
}
