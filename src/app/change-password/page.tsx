import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { PasswordForm } from './PasswordForm';

export const metadata: Metadata = { title: 'Парольді ауыстыру' };

export default async function ChangePasswordPage() {
  const profile = await requireUser({ allowPasswordChange: true });
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Жаңа пароль орнатыңыз</h1>
        {profile.must_change_password && (
          <p className="text-sm text-slate-600">Қауіпсіздік үшін уақытша парольді өз парольіңізге ауыстыру қажет.</p>
        )}
        <PasswordForm />
      </div>
    </main>
  );
}
