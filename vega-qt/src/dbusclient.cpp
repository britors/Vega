#include "dbusclient.h"

#include <QDBusConnection>
#include <QDBusError>
#include <QDBusMessage>
#include <QDBusPendingCallWatcher>

DbusClient::DbusClient(QObject *parent) : QObject(parent) {}

QDBusPendingCall DbusClient::call(const QString &interface, const QString &method,
                                  const QVariantList &arguments) {
    auto message = QDBusMessage::createMethodCall(QString::fromLatin1(Service),
                                                   QString::fromLatin1(Path), interface, method);
    message.setArguments(arguments);
    return QDBusConnection::systemBus().asyncCall(message, 30000);
}

QDBusPendingCallWatcher *DbusClient::watch(const QString &interface, const QString &method,
                                           const QVariantList &arguments, QObject *owner) {
    return new QDBusPendingCallWatcher(call(interface, method, arguments), owner ? owner : this);
}

DbusClient::Error DbusClient::classify(const QString &name) {
    if (name.isEmpty()) return Error::None;
    if (name.contains(QStringLiteral("NoReply")) || name.contains(QStringLiteral("Timeout"))) return Error::Timeout;
    if (name.contains(QStringLiteral("AccessDenied")) || name.contains(QStringLiteral("NotAuthorized"))) return Error::Denied;
    if (name.contains(QStringLiteral("UnknownMethod")) || name.contains(QStringLiteral("NotSupported"))) return Error::Unsupported;
    if (name.contains(QStringLiteral("ServiceUnknown")) || name.contains(QStringLiteral("NoServer"))) return Error::Unavailable;
    if (name.contains(QStringLiteral("Cancelled"))) return Error::Cancelled;
    return Error::Other;
}

QString DbusClient::userMessage(Error error) {
    switch (error) {
    case Error::None: return {};
    case Error::Unavailable: return tr("O serviço vegad não está disponível.");
    case Error::Timeout: return tr("O serviço demorou demais para responder.");
    case Error::Denied: return tr("A autorização foi negada.");
    case Error::Unsupported: return tr("Este recurso não está disponível neste sistema.");
    case Error::Cancelled: return tr("A operação foi cancelada.");
    case Error::Other: return tr("Não foi possível concluir a operação.");
    }
    return {};
}

bool DbusClient::startsTransaction(const QString &interface, const QString &method) {
    if (interface == QStringLiteral("Software"))
        return method == QStringLiteral("Install") || method == QStringLiteral("Remove") ||
               method == QStringLiteral("UpdateAll") || method == QStringLiteral("ClearCache") ||
               method == QStringLiteral("OptimizeMirrors");
    if (interface == QStringLiteral("Backup"))
        return method == QStringLiteral("RunBackupNow") || method == QStringLiteral("RestoreSnapshot") ||
               method == QStringLiteral("RestoreItems");
    return interface == QStringLiteral("Kernel") && method == QStringLiteral("Install");
}
