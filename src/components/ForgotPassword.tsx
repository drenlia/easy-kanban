import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

interface ForgotPasswordProps {
  onBackToLogin: () => void;
}

export default function ForgotPassword({ onBackToLogin }: ForgotPasswordProps) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Helper function to translate backend messages
  // Maps English backend messages to translation keys
  const translateBackendMessage = (backendMessage: string): string => {
    const messageMap: Record<string, string> = {
      'Too many password reset requests, please try again in 1 hour': 'forgotPassword.backendMessages.tooManyRequests',
      'Email is required': 'forgotPassword.backendMessages.emailRequired',
      'If an account with that email exists, you will receive a password reset link shortly.': 'forgotPassword.backendMessages.resetLinkSent',
      'Failed to process password reset request': 'forgotPassword.backendMessages.failedToProcess',
    };
    
    const translationKey = messageMap[backendMessage];
    if (translationKey) {
      return t(translationKey);
    }
    // If no match found, return original message
    return backendMessage;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/password-reset/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(translateBackendMessage(data.message));
        setSubmitted(true);
      } else {
        const translatedError = translateBackendMessage(data.error);
        setError(translatedError || t('forgotPassword.failedToSendResetEmail'));
      }
    } catch (error) {
      setError(t('forgotPassword.networkError'));
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              {t('forgotPassword.checkYourEmail')}
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              {t('forgotPassword.resetInstructionsSent')}
            </p>
          </div>
          
          <div className="rounded-md bg-green-50 p-4">
            <div className="text-sm text-green-700">
              {message}
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={onBackToLogin}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-600 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('forgotPassword.backToLogin')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {t('forgotPassword.title')}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t('forgotPassword.description')}
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="sr-only">
              {t('forgotPassword.emailAddress')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
              placeholder={t('forgotPassword.emailAddress')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">
                {error}
              </div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? t('forgotPassword.sending') : t('forgotPassword.sendResetLink')}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={onBackToLogin}
              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-500"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              {t('forgotPassword.backToLogin')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
