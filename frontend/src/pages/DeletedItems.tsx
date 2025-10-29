import React, { useState, useEffect } from 'react';
import { Trash2, RotateCcw, Clock, AlertCircle } from 'lucide-react';
import {
  ContentDeleteButton,
  RestoreButton,
  BulkDeleteButton,
} from '../components/DeleteComponents';
import { apiClient } from '../services/api.client';

interface DeletedContent {
  _id: string;
  title: string;
  type: string;
  deletedAt: string;
  recoveryInfo: {
    daysSinceDeletion: number;
    daysUntilPermanentDeletion: number;
    canRecover: boolean;
  };
}

interface DeletedContentsResponse {
  success: boolean;
  data: {
    contents: DeletedContent[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export const DeletedItems: React.FC = () => {
  const [deletedContents, setDeletedContents] = useState<DeletedContent[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  useEffect(() => {
    fetchDeletedContents();
  }, [page]);

  const fetchDeletedContents = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiClient.get<DeletedContentsResponse>(
        `/contents/deleted/list?page=${page}&limit=10`
      );
      
      setDeletedContents(result.data.contents);
      setPagination({
        total: result.data.pagination.total,
        totalPages: result.data.pagination.totalPages,
        hasNextPage: result.data.pagination.page < result.data.pagination.totalPages,
        hasPrevPage: result.data.pagination.page > 1,
      });
    } catch (error) {
      console.error('Error fetching deleted contents:', error);
      setError('Failed to load deleted items. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(deletedContents.map((c) => c._id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleActionSuccess = () => {
    setSelectedIds([]);
    fetchDeletedContents();
  };

  const getRecoveryStatusColor = (days: number) => {
    if (days > 20) return 'text-red-600';
    if (days > 10) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-red-600" size={24} />
            <div>
              <h3 className="text-lg font-semibold text-red-900">Error Loading Deleted Items</h3>
              <p className="text-red-700 mt-1">{error}</p>
              <button
                onClick={fetchDeletedContents}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Deleted Items</h1>
        <p className="text-gray-600">
          Items deleted within the last 30 days can be restored. After 30 days, they will be
          permanently deleted.
        </p>
      </div>

      {deletedContents.length === 0 ? (
        <div className="text-center py-12">
          <Trash2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-xl text-gray-500">No deleted items</p>
          <p className="text-gray-400 mt-2">Deleted content will appear here</p>
        </div>
      ) : (
        <>
          {/* Bulk Actions */}
          {selectedIds.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center justify-between">
              <span className="text-blue-800 font-medium">
                {selectedIds.length} item(s) selected
              </span>
              <div className="flex space-x-3">
                <button
                  onClick={async () => {
                    for (const id of selectedIds) {
                      const content = deletedContents.find((c) => c._id === id);
                      if (content) {
                        // Get token from auth-storage (Zustand persist storage)
                        let token: string | null = null;
                        try {
                          const authStorage = localStorage.getItem('auth-storage');
                          if (authStorage) {
                            const { state } = JSON.parse(authStorage);
                            token = state?.token || null;
                          }
                        } catch (error) {
                          console.error('Failed to parse auth storage:', error);
                        }
                        await fetch(`/api/contents/${id}/restore`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` },
                        });
                      }
                    }
                    handleActionSuccess();
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restore Selected
                </button>
                <BulkDeleteButton
                  contentIds={selectedIds}
                  onDeleteSuccess={handleActionSuccess}
                  isPermanent={true}
                />
              </div>
            </div>
          )}

          {/* Contents List */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === deletedContents.length}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Title
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Type
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Deleted
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Recovery Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {deletedContents.map((content) => (
                  <tr key={content._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(content._id)}
                        onChange={() => handleSelectOne(content._id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{content.title}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                        {content.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(content.deletedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className={`flex items-center text-sm font-medium ${getRecoveryStatusColor(
                          content.recoveryInfo.daysSinceDeletion
                        )}`}
                      >
                        <Clock className="w-4 h-4 mr-2" />
                        {content.recoveryInfo.daysUntilPermanentDeletion} days left
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        {content.recoveryInfo.canRecover ? (
                          <>
                            <RestoreButton
                              contentId={content._id}
                              contentTitle={content.title}
                              onRestoreSuccess={handleActionSuccess}
                              size="sm"
                              showText={false}
                            />
                            <ContentDeleteButton
                              contentId={content._id}
                              contentTitle={content.title}
                              onDeleteSuccess={handleActionSuccess}
                              isPermanent={true}
                              size="sm"
                              showText={false}
                            />
                          </>
                        ) : (
                          <span className="text-xs text-red-600 flex items-center">
                            <AlertCircle className="w-4 h-4 mr-1" />
                            Expired
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-between items-center mt-6">
              <div className="text-sm text-gray-600">
                Showing {deletedContents.length} of {pagination.total} items
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={!pagination.hasPrevPage}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-sm text-gray-700">
                  Page {page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={!pagination.hasNextPage}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Info Banner */}
      <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-1">About Deleted Items</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Deleted items are kept for 30 days before permanent deletion</li>
              <li>You can restore items at any time within the 30-day window</li>
              <li>
                Permanent deletion removes all related data (flashcards, summaries, Q&A, etc.)
              </li>
              <li>After 30 days, items are automatically and permanently deleted</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
