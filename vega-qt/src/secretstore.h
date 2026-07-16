#pragma once

#include <QObject>
#include <functional>

class SecretStore final : public QObject {
    Q_OBJECT
public:
    using Completion = std::function<void(bool, const QString &)>;

    explicit SecretStore(QObject *parent = nullptr);
    bool isAvailable() const;
    void store(const QString &provider, const QString &secret, QObject *context, Completion completion);
    void clear(const QString &provider, QObject *context, Completion completion);
    void load(const QString &provider, QObject *context, Completion completion);

    static QString applicationAttribute();
    static QStringList attributes(const QString &provider);
};
