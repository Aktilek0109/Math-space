'use client';

export function LogoutButton() {
  return (
    <button
      className="btn btn-secondary px-3 py-1.5"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.assign('/login');
      }}
    >
      Шығу
    </button>
  );
}
