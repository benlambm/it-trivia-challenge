import React, { useEffect } from 'react';

interface ErrorToastProps {
  message: string;
  onClose: () => void;
}

const ErrorToast: React.FC<ErrorToastProps> = ({ message, onClose }) => {
  // Auto-dismiss after 6 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 6000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-11/12 max-w-lg z-50 animate-[slideUp_0.3s_ease-out]">
      <div className="bg-[#D63A4C] text-white px-6 py-4 rounded-2xl border-4 border-[#173A45] shadow-[8px_8px_0px_0px_rgba(23,58,69,0.4)] flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-1">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="font-black text-xl mb-1">Error Detected</h3>
            <p className="font-medium text-lg opacity-90 leading-tight">{message}</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="ml-4 text-white hover:text-[#173A45] transition-colors p-1"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ErrorToast;