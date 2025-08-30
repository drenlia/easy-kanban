import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';

interface UserPresenceProps {
  socket: any;
  currentUser: any;
  members: any[];
  boardOnlineUsers?: Set<string>;
}

interface OnlineUser {
  userId: string;
  firstName: string;
  lastName: string;
  timestamp: string;
}

export default function UserPresence({ socket, currentUser, members, boardOnlineUsers = new Set() }: UserPresenceProps) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [showUserList, setShowUserList] = useState(false);

  useEffect(() => {
    if (!socket?.isConnected) return;

    const handleUserJoined = (data: OnlineUser) => {
      // Don't show yourself joining
      if (data.userId === currentUser?.id) return;
      
      setOnlineUsers(prev => {
        // Remove if already exists, then add to avoid duplicates
        const filtered = prev.filter(user => user.userId !== data.userId);
        return [...filtered, data];
      });
    };

    const handleUserLeft = (data: OnlineUser) => {
      setOnlineUsers(prev => prev.filter(user => user.userId !== data.userId));
    };

    socket.on('user:joined', handleUserJoined);
    socket.on('user:left', handleUserLeft);

    return () => {
      socket.off('user:joined', handleUserJoined);
      socket.off('user:left', handleUserLeft);
    };
  }, [socket, currentUser?.id]);

  // Get member details for online users
  const getOnlineUserDetails = () => {
    return onlineUsers.map(onlineUser => {
      const member = members.find(m => m.user_id === onlineUser.userId);
      return {
        ...onlineUser,
        member,
        displayName: member?.name || `${onlineUser.firstName} ${onlineUser.lastName}`,
        color: member?.color || '#4ECDC4'
      };
    });
  };

  const onlineUserDetails = getOnlineUserDetails();
  const onlineCount = onlineUserDetails.length;

  if (!socket?.isConnected || onlineCount === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowUserList(!showUserList)}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100 transition-colors text-sm"
        title={`${onlineCount} user${onlineCount === 1 ? '' : 's'} online`}
      >
        <Users size={16} />
        <span>{onlineCount} online</span>
      </button>

      {showUserList && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-3">
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Currently Viewing This Board
            </h3>
            
            <div className="space-y-2">
              {onlineUserDetails.map((user) => (
                <div key={user.userId} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.firstName[0]}{user.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user.displayName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Joined {new Date(user.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="w-2 h-2 bg-green-500 rounded-full" title="Online" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {showUserList && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowUserList(false)}
        />
      )}
    </div>
  );
}
