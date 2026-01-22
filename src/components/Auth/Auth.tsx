import { useState } from 'react';
import { useLoginWithEmail } from '@privy-io/react-auth'

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
            })
        },
        onError: (error) => {
            console.log(error)
        },
    })

    // Email Local State
    const [email, setEmail] = useState('')
    const [codeEmail, setCodeEmail] = useState('')

    const isSendingCode = stateEmail.status === 'sending-code'
    const isSubmittingCode = stateEmail.status === 'submitting-code'
    const isAwaitingCodeInput = stateEmail.status === 'awaiting-code-input'
    const isError = stateEmail.status === 'error'

    const statusText =
        isError && stateEmail.error
            ? `Error: ${stateEmail.error.message}`
            : `Status: ${stateEmail.status}`

    const canSendCode = email.trim().length > 0 && !isSendingCode
    const canLogin =
        codeEmail.trim().length > 0 &&
        (isAwaitingCodeInput || isError || stateEmail.status === 'initial')

    return (
        <div className="min-h-screen w-full bg-slate-950 px-4 py-10 text-slate-100">
            <div className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur">
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
                    <p className="text-sm text-slate-300">
                        Enter your email to receive a one-time code, then paste it below to continue.
                    </p>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-200" htmlFor="auth-email">
                        Email
                    </label>
                    <input
                        id="auth-email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.currentTarget.value)
                        }}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none ring-0 focus:border-slate-500 focus:outline-none"
                    />
                    <button
                        type="button"
                        onClick={() => {
                            void sendCodeEmail({ email })
                        }}
                        disabled={!canSendCode}
                        className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isSendingCode ? 'Sending…' : 'Send code'}
                    </button>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-200" htmlFor="auth-otp">
                        One-time code
                    </label>
                    <input
                        id="auth-otp"
                        placeholder="123456"
                        value={codeEmail}
                        onChange={(e) => {
                            setCodeEmail(e.currentTarget.value)
                        }}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none ring-0 focus:border-slate-500 focus:outline-none"
                    />
                    <button
                        type="button"
                        onClick={() => {
                            void loginWithCodeEmail({ code: codeEmail })
                        }}
                        disabled={!canLogin || isSubmittingCode}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isSubmittingCode ? 'Logging in…' : 'Continue'}
                    </button>
                </div>

                <p className={`text-xs ${isError ? 'text-red-300' : 'text-slate-400'}`}>{statusText}</p>
            </div>
        </div>
    )
}

export default Auth