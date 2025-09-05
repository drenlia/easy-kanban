import React from 'react';
import { CheckCircle, ArrowLeft } from 'lucide-react';

interface ResetPasswordSuccessProps {
  onBackToLogin: () => void;
}

export default function ResetPasswordSuccess({ onBackToLogin }: ResetPasswordSuccessProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Password Reset Successful
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Your password has been reset successfully. You can now login with your new password.
          </p>
        </div>
        
        <div className="rounded-md bg-green-50 p-4">
          <div className="text-sm text-green-700">
            Your password has been changed. Please login with your new credentials.
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={onBackToLogin}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
