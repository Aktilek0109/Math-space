'use client';

export function LogoutButton() {
  return (
    <button
      className="btn btn-secondary min-h-9 px-3 py-1 text-xs"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.assign('/login');
      }}
    >
      Шығу
    </button>
  );
}
