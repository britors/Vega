#pragma once

#include <QDBusPendingCall>
#include <QObject>
#include <QVariantList>

class QDBusPendingCallWatcher;

class DbusClient : public QObject {
    Q_OBJECT
public:
    enum class Error { None, Unavailable, Timeout, Denied, Unsupported, Cancelled, Other };
    Q_ENUM(Error)

    explicit DbusClient(QObject *parent = nullptr);
    QDBusPendingCall call(const QString &interface, const QString &method,
                          const QVariantList &arguments = {});
    virtual QDBusPendingCallWatcher *watch(const QString &interface, const QString &method,
                                           const QVariantList &arguments = {}, QObject *owner = nullptr);
    static Error classify(const QString &dbusErrorName);
    static QString userMessage(Error error);
    static bool startsTransaction(const QString &interface, const QString &method);

    static constexpr auto Service = "org.lyraos.Vega1";
    static constexpr auto Path = "/org/lyraos/Vega1";
};
