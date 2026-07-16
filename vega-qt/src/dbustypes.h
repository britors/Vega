#pragma once

#include <QDBusArgument>
#include <QMetaType>
#include <QString>
#include <QStringList>

struct BackupConfig {
    QString id;
    QStringList paths;
    QString destination;
    QString destinationUuid;
    QString frequency;
};

Q_DECLARE_METATYPE(BackupConfig)

QDBusArgument &operator<<(QDBusArgument &argument, const BackupConfig &config);
const QDBusArgument &operator>>(const QDBusArgument &argument, BackupConfig &config);
void registerDbusTypes();
