import { useTranslation } from 'react-i18next';

interface NetworkStatusIndicatorProps {
  isOnline: boolean;
}

const NetworkStatusIndicator: React.FC<NetworkStatusIndicatorProps> = ({ isOnline }) => {
  const { t } = useTranslation('common');
  
  if (isOnline) {
    return null; // Don't show anything when online
  }

  return (
    <div className="fixed top-16 left-4 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-pulse">
      <svg 
        className="w-5 h-5" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" 
        />
      </svg>
      <span className="font-medium">{t('networkStatusIndicator.offlineMessage')}</span>
    </div>
  );
};

export default NetworkStatusIndicator;

