import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Circle, RefreshCcw } from "lucide-react";
import { Link } from "react-router";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRecord,
} from "@/lib/repositories/notificationsRepository";
import "./notifications-template.css";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString();
}

export default function Notifications() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [markingAll, setMarkingAll] = useState(false);

  const refreshNotifications = async () => {
    const rows = await listNotifications(80);
    setNotifications(rows);
  };

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        await refreshNotifications();
        if (!active) return;
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unable to load notifications.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, []);

  const unreadCount = useMemo(
    () => notifications.reduce((count, item) => count + (item.readAt ? 0 : 1), 0),
    [notifications],
  );

  const handleMarkRead = async (notificationId: string) => {
    setBusyIds((previous) => ({ ...previous, [notificationId]: true }));
    try {
      await markNotificationRead(notificationId);
      setNotifications((previous) => previous.map((item) => (
        item.id === notificationId
          ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
          : item
      )));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to mark notification as read.");
    } finally {
      setBusyIds((previous) => ({ ...previous, [notificationId]: false }));
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((previous) => previous.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to mark notifications as read.");
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="ou-notifications-page">
      <header className="ou-notifications-header">
        <div>
          <h1 className="ou-notifications-title">Notification Center</h1>
          <p className="ou-notifications-subtitle">Review recent alerts and mark them as read.</p>
        </div>
        <div className="ou-notifications-actions">
          <button
            type="button"
            className="ou-btn ou-btn-outline"
            onClick={() => void refreshNotifications()}
            disabled={loading}
          >
            <RefreshCcw size={14} /> Refresh
          </button>
          <button
            type="button"
            className="ou-btn ou-btn-primary"
            onClick={() => void handleMarkAllRead()}
            disabled={markingAll || unreadCount === 0}
          >
            <CheckCheck size={14} /> Mark all read
          </button>
        </div>
      </header>

      <div className="ou-notification-summary">
        <div className="ou-notification-chip"><Bell size={14} /> {notifications.length} total</div>
        <div className="ou-notification-chip unread"><Circle size={10} /> {unreadCount} unread</div>
        <Link className="ou-notification-settings-link" to="/settings#notifications">Manage notification preferences</Link>
      </div>

      {loading && <p className="ou-status-text">Loading notifications...</p>}
      {!loading && errorMessage && <p className="ou-status-text ou-status-error">{errorMessage}</p>}

      {!loading && !errorMessage && (
        <section className="ou-notifications-list" aria-live="polite">
          {notifications.length === 0 ? (
            <div className="ou-notifications-empty">
              <Bell size={20} />
              <p>No notifications yet.</p>
            </div>
          ) : notifications.map((item) => (
            <article key={item.id} className={`ou-notification-row ${item.readAt ? "read" : "unread"}`}>
              <div className="ou-notification-main">
                <div className="ou-notification-meta">
                  <span className="ou-notification-type">{item.type.replace(/_/g, " ")}</span>
                  <span className="ou-notification-time">{formatTimestamp(item.createdAt)}</span>
                </div>
                <h2 className="ou-notification-title">{item.title}</h2>
                {item.message ? <p className="ou-notification-message">{item.message}</p> : null}
              </div>
              <div className="ou-notification-actions">
                {item.readAt ? (
                  <span className="ou-notification-read-pill">Read</span>
                ) : (
                  <button
                    type="button"
                    className="ou-btn ou-btn-outline"
                    onClick={() => void handleMarkRead(item.id)}
                    disabled={Boolean(busyIds[item.id])}
                  >
                    Mark read
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}