import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { login } from '../api';

interface ResetPasswordProps {
  token: string;
  onBackToLogin: () => void;
  onResetSuccess: () => void;
  onAutoLogin: (user: any, token: string) => Promise<void>;
}

export default function ResetPassword({ token, onBackToLogin, onResetSuccess, onAutoLogin }: ResetPasswordProps) {
  const { t } = useTranslation('auth');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState('');

  // Helper function to translate backend messages
  // Maps English backend messages to translation keys
  const translateBackendMessage = (backendMessage: string): string => {
    const messageMap: Record<string, string> = {
      'Too many password reset attempts, please try again in 1 hour': 'resetPassword.backendMessages.tooManyAttempts',
      'Token and new password are required': 'resetPassword.backendMessages.tokenAndPasswordRequired',
      'Password must be at least 6 characters long': 'resetPassword.backendMessages.passwordTooShort',
      'Invalid or expired reset token': 'resetPassword.backendMessages.invalidOrExpiredToken',
      'Password has been reset successfully. You can now login with your new password.': 'resetPassword.backendMessages.resetSuccess',
      'Token is required': 'resetPassword.backendMessages.tokenRequired',
      'Failed to verify token': 'resetPassword.backendMessages.failedToVerify',
    };
    
    const translationKey = messageMap[backendMessage];
    if (translationKey) {
      return t(translationKey);
    }
    // If no match found, return original message
    return backendMessage;
  };

  // Verify token on component mount
  useEffect(() => {
    if (!token || token.length < 10) {
      // Don't immediately fail - token might still be loading from URL
      if (token === '') {
        // Still waiting for token to be extracted from URL
        return;
      }
      setTokenValid(false);
      setError(t('resetPassword.noTokenProvided'));
      return;
    }
    
    const verifyToken = async () => {
      try {
        const response = await fetch(`/api/password-reset/verify/${token}`);
        const data = await response.json();
        
        if (response.ok) {
          setTokenValid(true);
          setUserEmail(data.email);
        } else {
          setTokenValid(false);
          const translatedError = translateBackendMessage(data.error);
          setError(translatedError || t('resetPassword.invalidToken'));
        }
      } catch (error) {
        setTokenValid(false);
        setError(t('resetPassword.failedToVerifyToken'));
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (password.length < 6) {
      setError(t('resetPassword.passwordTooShort'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('resetPassword.passwordsDoNotMatch'));
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/password-reset/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          token, 
          newPassword: password 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Password reset successful, now perform normal login with new password
        try {
          const loginResponse = await login(userEmail, password);
          // Use the normal login flow
          onAutoLogin(loginResponse.user, loginResponse.token);
        } catch (loginError) {
          // If auto-login fails, still show success but user can login manually
          console.warn('Auto-login after password reset failed:', loginError);
          onResetSuccess();
        }
      } else {
        const translatedError = translateBackendMessage(data.error);
        setError(translatedError || t('resetPassword.failedToReset'));
      }
    } catch (error) {
      setError(t('resetPassword.networkError'));
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while waiting for token or verifying token
  if (!token || token.length < 10 || tokenValid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">
            {!token || token.length < 10 ? t('resetPassword.loadingToken') : t('resetPassword.verifyingToken')}
          </p>
        </div>
      </div>
    );
  }

  // Invalid token state
  if (tokenValid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              {t('resetPassword.invalidLink')}
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              {t('resetPassword.linkExpired')}
            </p>
          </div>
          
          <div className="rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-700">
              {error}
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={onBackToLogin}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-600 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('resetPassword.backToLogin')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Valid token - show reset form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {t('resetPassword.title')}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t('resetPassword.enterNewPassword', { email: userEmail })}
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="relative">
              <label htmlFor="password" className="sr-only">
                {t('resetPassword.newPassword')}
              </label>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                className="appearance-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder={t('resetPassword.newPasswordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-gray-400" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>

            <div className="relative">
              <label htmlFor="confirmPassword" className="sr-only">
                {t('resetPassword.confirmPassword')}
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                className="appearance-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder={t('resetPassword.confirmPasswordPlaceholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4 text-gray-400" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>
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
              {isLoading ? t('resetPassword.resetting') : t('resetPassword.submit')}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={onBackToLogin}
              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-500"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              {t('resetPassword.backToLogin')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
