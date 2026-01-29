import React from "react";

interface LinkCaptureItemProps {
  url: string;
  title: string;
}

/**
 * Visual component for displaying a captured link notification
 * Shown in PageToolSlot with brief feedback styling
 */
export const LinkCaptureItem: React.FC<LinkCaptureItemProps> = ({
  url,
  title
}) => {
  return (
    <div style={{
      padding: '12px 16px',
      background: '#f0f9ff',  // Light blue background
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
    }}>
      <span style={{ color: '#10b981', fontSize: '18px' }}>✓</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 500,
          marginBottom: '2px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          Link captured: {title}
        </div>
        <div style={{
          fontSize: '12px',
          color: '#6b7280',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {url}
        </div>
      </div>
    </div>
  );
};
