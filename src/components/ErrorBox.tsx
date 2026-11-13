export function ErrorBox({ lines }: { lines: string[] | null }) {
  if (!lines || lines.length === 0) return null;
  return (
    <div role="alert" className="error-box space-y-1">
      {lines.map((l, i) => (
        <p key={i} className={i === 0 ? 'font-medium' : ''}>
          {l}
        </p>
      ))}
    </div>
  );
}
