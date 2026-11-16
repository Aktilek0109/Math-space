import { NextResponse } from 'next/server';

/** Апталық тазалаудан кейін өшірілген сурет орнына көрсетілетін белгі (балл мен тексеру нәтижесі сақталған). */
export function purgedImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320"><rect width="240" height="320" fill="#f1f5f9"/><text x="120" y="150" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#64748b">Сурет тазаланды</text><text x="120" y="176" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#94a3b8">(7 күннен ескі)</text></svg>`;
  return new NextResponse(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } });
}
