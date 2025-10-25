import React, { useState } from 'react';
import { Trash2, X, AlertTriangle, RotateCcw } from 'lucide-react';
import { contentService } from '../services/content.service';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  isPermanent?: boolean;
  isLoading?: boolean;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  isPermanent = false,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <AlertTriangle
              className={`w-6 h-6 mr-3 ${
                isPermanent ? 'text-red-600' : 'text-yellow-600'
              }`}
            />
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isLoading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-gray-600 mb-4">{message}</p>

        {isPermanent && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <p className="text-sm text-red-800 font-medium">
              ⚠️ This action cannot be undone. All related data (flashcards,
              quizzes, summaries, Q&A records) will be permanently deleted.
            </p>
          </div>
        )}

        {!isPermanent && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
            <p className="text-sm text-blue-800">
              You can restore this content within 30 days from the "Deleted Items" section.
            </p>
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-white rounded-md flex items-center ${
              isPermanent
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-yellow-600 hover:bg-yellow-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                {isPermanent ? 'Delete Permanently' : 'Delete'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ContentDeleteButtonProps {
  contentId: string;
  contentTitle: string;
  onDeleteSuccess?: () => void;
  isPermanent?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export const ContentDeleteButton: React.FC<ContentDeleteButtonProps> = ({
  contentId,
  contentTitle,
  onDeleteSuccess,
  isPermanent = false,
  size = 'md',
  showText = true,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      if (isPermanent) {
        // Use apiClient for permanent delete since contentService doesn't have this method yet
        const { apiClient } = await import('../services/api.client');
        await apiClient.delete(`/contents/${contentId}/permanent`);
      } else {
        // Use contentService for soft delete
        await contentService.deleteContent(contentId);
      }

      setIsModalOpen(false);
      if (onDeleteSuccess) {
        onDeleteSuccess();
      }
    } catch (error) {
      console.error('Error deleting content:', error);
      alert('Failed to delete content. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`${sizeClasses[size]} ${
          isPermanent
            ? 'text-red-600 hover:bg-red-50'
            : 'text-yellow-600 hover:bg-yellow-50'
        } rounded-md flex items-center transition-colors`}
        title={isPermanent ? 'Delete permanently' : 'Delete'}
      >
        <Trash2 className={`${iconSizes[size]} ${showText ? 'mr-2' : ''}`} />
        {showText && (isPermanent ? 'Delete Forever' : 'Delete')}
      </button>

      <DeleteConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleDelete}
        title={isPermanent ? 'Permanently Delete Content?' : 'Delete Content?'}
        message={`Are you sure you want to delete "${contentTitle}"?`}
        isPermanent={isPermanent}
        isLoading={isLoading}
      />
    </>
  );
};

interface RestoreButtonProps {
  contentId: string;
  contentTitle: string;
  onRestoreSuccess?: () => void;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export const RestoreButton: React.FC<RestoreButtonProps> = ({
  contentId,
  contentTitle,
  onRestoreSuccess,
  size = 'md',
  showText = true,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const handleRestore = async () => {
    if (!confirm(`Restore "${contentTitle}"?`)) {
      return;
    }

    setIsLoading(true);
    try {
      const { apiClient } = await import('../services/api.client');
      await apiClient.post(`/contents/${contentId}/restore`);

      if (onRestoreSuccess) {
        onRestoreSuccess();
      }
    } catch (error) {
      console.error('Error restoring content:', error);
      alert('Failed to restore content. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleRestore}
      disabled={isLoading}
      className={`${sizeClasses[size]} text-green-600 hover:bg-green-50 rounded-md flex items-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
      title="Restore content"
    >
      {isLoading ? (
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-600 border-t-transparent" />
      ) : (
        <>
          <RotateCcw className={`${iconSizes[size]} ${showText ? 'mr-2' : ''}`} />
          {showText && 'Restore'}
        </>
      )}
    </button>
  );
};

interface BulkDeleteButtonProps {
  contentIds: string[];
  onDeleteSuccess?: () => void;
  isPermanent?: boolean;
}

export const BulkDeleteButton: React.FC<BulkDeleteButtonProps> = ({
  contentIds,
  onDeleteSuccess,
  isPermanent = false,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleBulkDelete = async () => {
    setIsLoading(true);
    try {
      const { apiClient } = await import('../services/api.client');
      const result = await apiClient.post<{ success: boolean; message: string }>('/contents/bulk-delete', {
        contentIds,
        permanent: isPermanent,
      });

      alert(result.message);

      setIsModalOpen(false);
      if (onDeleteSuccess) {
        onDeleteSuccess();
      }
    } catch (error) {
      console.error('Error deleting contents:', error);
      alert('Failed to delete contents. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        disabled={contentIds.length === 0}
        className={`px-4 py-2 rounded-md flex items-center ${
          isPermanent
            ? 'text-red-600 bg-red-50 hover:bg-red-100'
            : 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Trash2 className="w-4 h-4 mr-2" />
        {isPermanent ? 'Delete Selected Forever' : 'Delete Selected'} ({contentIds.length})
      </button>

      <DeleteConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleBulkDelete}
        title={isPermanent ? 'Permanently Delete Contents?' : 'Delete Contents?'}
        message={`Are you sure you want to delete ${contentIds.length} item(s)?`}
        isPermanent={isPermanent}
        isLoading={isLoading}
      />
    </>
  );
};
