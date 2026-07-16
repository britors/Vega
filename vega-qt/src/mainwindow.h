#pragma once

#include <QMainWindow>
#include <QHash>
#include <QSet>

class DbusClient;
class QLabel;
class QListWidget;
class QStackedWidget;
class QVBoxLayout;
class QProgressBar;
class QDBusServiceWatcher;
class QDBusMessage;
class SecretStore;

class MainWindow final : public QMainWindow {
    Q_OBJECT
public:
    explicit MainWindow(QWidget *parent = nullptr, DbusClient *client = nullptr);
    QStringList routeNames() const;
    bool tracksTransaction(quint32 id) const;
    void trackTransaction(quint32 id);
    bool canInstallAur(const QString &packageId) const;
    void markAurReviewed(const QString &packageId);

private slots:
    void transactionProgress(quint32 id, quint32 percent, const QString &message);
    void transactionFinished(quint32 id, bool success, const QString &message);

private:
    struct RouteSpec {
        const char *id;
        QString title;
        QString description;
        const char *interface;
        const char *readMethod;
        QVariantList readArguments;
    };
    enum class InputType { Text, OptionalText, Secret, Boolean, Unsigned, StringList };
    struct InputSpec { QString label; InputType type; };
    void addRoute(const RouteSpec &spec);
    void addAction(QVBoxLayout *layout, const QString &interface, const QString &method,
                   const QString &label, const QList<InputSpec> &inputs, bool destructive);
    void refresh(const RouteSpec &spec, QLabel *state);
    static QString renderReply(const RouteSpec &spec, const QDBusMessage &reply);
    void checkBackend();
    DbusClient *m_client;
    QListWidget *m_navigation;
    QStackedWidget *m_pages;
    QLabel *m_backendStatus;
    QLabel *m_progressText;
    QProgressBar *m_progress;
    QSet<quint32> m_transactions;
    QSet<QString> m_reviewedAurPackages;
    QDBusServiceWatcher *m_serviceWatcher;
    SecretStore *m_secretStore;
    QHash<QString, QWidget *> m_routes;
};
