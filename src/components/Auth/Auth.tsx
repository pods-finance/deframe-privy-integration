import { useState } from 'react';
import { useLoginWithEmail } from '@privy-io/react-auth';

const Auth = () => {
  const {
    sendCode: sendCodeEmail,
    loginWithCode: loginWithCodeEmail,
    state: stateEmail,
  } = useLoginWithEmail({
    onComplete: ({ user, isNewUser, wasAlreadyAuthenticated, loginMethod }) => {
      console.log('User successfully logged in with email', {
        user,
        isNewUser,
        wasAlreadyAuthenticated,
        loginMethod,
      });
    },
    onError: (error) => {
      console.log(error);
    },
  });

  const [email, setEmail] = useState('');
  const [codeEmail, setCodeEmail] = useState('');

  const isSendingCode = stateEmail.status === 'sending-code';
  const isSubmittingCode = stateEmail.status === 'submitting-code';
  const isAwaitingCodeInput = stateEmail.status === 'awaiting-code-input';
  const isError = stateEmail.status === 'error';

  const statusText =
    isError && stateEmail.error
      ? `Error: ${stateEmail.error.message}`
      : `Status: ${stateEmail.status}`;

  const canSendCode = email.trim().length > 0 && !isSendingCode;
  const canLogin =
    codeEmail.trim().length > 0 &&
    (isAwaitingCodeInput || isError || stateEmail.status === 'initial');

  return (
    <div className="ui-page ui-surface-warm flex min-h-screen items-center justify-center px-6 py-10">
      <div className="ui-card w-full max-w-md p-6 lg:p-8">
        <div className="mb-6 flex flex-col gap-2">
          <p className="text-caption font-medium uppercase tracking-caps text-gray-400">
            Deframe integration
          </p>
          <h1 className="text-display-m font-light text-ink tracking-[-0.02em] leading-[1.08]">
            Sign in to{' '}
            <span className="font-serif italic text-secondary">continue</span>
          </h1>
          <p className="text-body text-gray-500 leading-relaxed">
            Enter your email to receive a one-time code, then paste it below.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="ui-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.currentTarget.value); }}
              className="ui-input"
            />
            <button
              type="button"
              onClick={() => { void sendCodeEmail({ email }); }}
              disabled={!canSendCode}
              className="ui-btn-primary w-full !py-3"
            >
              {isSendingCode ? 'Sending…' : 'Send code'}
            </button>
          </div>

          <div className="h-px bg-gray-200" />

          <div className="flex flex-col gap-2">
            <label className="ui-label" htmlFor="auth-otp">
              One-time code
            </label>
            <input
              id="auth-otp"
              placeholder="123456"
              value={codeEmail}
              onChange={(e) => { setCodeEmail(e.currentTarget.value); }}
              className="ui-input"
            />
            <button
              type="button"
              onClick={() => { void loginWithCodeEmail({ code: codeEmail }); }}
              disabled={!canLogin || isSubmittingCode}
              className="ui-btn-accent w-full"
            >
              {isSubmittingCode ? 'Logging in…' : 'Sign in'}
            </button>
          </div>

          <p className={`text-caption ${isError ? 'ui-text-error' : 'ui-text-muted'}`}>
            {statusText}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
