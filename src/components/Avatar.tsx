/** Профиль суреті: жүктелген фото (рұқсат тексеріліп беріледі) немесе аты-жөнінің бас әріптері. */
export function Avatar({ id, name, path, size = 40 }: { id: string; name: string; path?: string | null; size?: number }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (path) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/avatar/${id}?v=${encodeURIComponent(path)}`} alt="" style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return <span aria-hidden="true" style={style} className="flex shrink-0 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-700">{initials}</span>;
}
