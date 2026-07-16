#include "dbustypes.h"

#include <QDBusMetaType>

QDBusArgument &operator<<(QDBusArgument &argument, const BackupConfig &config) {
    argument.beginStructure();
    argument << config.id << config.paths << config.destination << config.destinationUuid << config.frequency;
    argument.endStructure();
    return argument;
}

const QDBusArgument &operator>>(const QDBusArgument &argument, BackupConfig &config) {
    argument.beginStructure();
    argument >> config.id >> config.paths >> config.destination >> config.destinationUuid >> config.frequency;
    argument.endStructure();
    return argument;
}

void registerDbusTypes() {
    qRegisterMetaType<BackupConfig>();
    qDBusRegisterMetaType<BackupConfig>();
}
