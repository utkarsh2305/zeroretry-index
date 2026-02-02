/**
 * Toast Notification Component
 * Shows temporary messages for user feedback
 */

const TOAST_ID = 'zeroretry-toast';
const TOAST_DURATION = 3000; // 3 seconds

/**
 * Shows a toast notification
 */
export function showToast(message: string, isError: boolean = false): void {
  // Remove existing toast
  const existing = document.getElementById(TOAST_ID);
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.textContent = message;

  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '80px',
    right: '20px',
    padding: '12px 20px',
    backgroundColor: isError ? '#dc2626' : '#10b981',
    color: '#ffffff',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: '10001',
    opacity: '0',
    transform: 'translateY(20px)',
    transition: 'all 0.3s ease',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    maxWidth: '300px',
    wordWrap: 'break-word'
  });

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Animate out after duration
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300);
  }, TOAST_DURATION);
}

/**
 * Shows a success toast
 */
export function showSuccessToast(message: string): void {
  showToast(message, false);
}

/**
 * Shows an error toast
 */
export function showErrorToast(message: string): void {
  showToast(message, true);
}
