import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Entrar · Acopio' };

export default function LoginPage() {
  return (
    <main className="page">
      <div className="page-inner narrow">
        <span className="logo"><i aria-hidden="true" />Acopio</span>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
