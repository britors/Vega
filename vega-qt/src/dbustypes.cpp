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

#define VEGA_DBUS_IO(Type, WriteFields, ReadFields) \
    QDBusArgument &operator<<(QDBusArgument &argument, const Type &value) { \
        argument.beginStructure(); argument WriteFields; argument.endStructure(); return argument; \
    } \
    const QDBusArgument &operator>>(const QDBusArgument &argument, Type &value) { \
        argument.beginStructure(); argument ReadFields; argument.endStructure(); return argument; \
    }

VEGA_DBUS_IO(BackupSnapshot, << value.id << value.timestamp << value.fileCount << value.sizeBytes,
             >> value.id >> value.timestamp >> value.fileCount >> value.sizeBytes)
VEGA_DBUS_IO(BluetoothStatus,
             << value.available << value.powered << value.discoverable << value.pairable << value.scanning
             << value.controller << value.controllerName << value.transferAvailable << value.receiverActive << value.receivePath,
             >> value.available >> value.powered >> value.discoverable >> value.pairable >> value.scanning
             >> value.controller >> value.controllerName >> value.transferAvailable >> value.receiverActive >> value.receivePath)
VEGA_DBUS_IO(BluetoothDevice,
             << value.address << value.name << value.alias << value.icon << value.paired << value.trusted
             << value.connected << value.blocked << value.rssi,
             >> value.address >> value.name >> value.alias >> value.icon >> value.paired >> value.trusted
             >> value.connected >> value.blocked >> value.rssi)
VEGA_DBUS_IO(DateTimeStatus, << value.timezone << value.ntp << value.locale << value.keymap,
             >> value.timezone >> value.ntp >> value.locale >> value.keymap)
VEGA_DBUS_IO(FirewallService, << value.name << value.label << value.enabled,
             >> value.name >> value.label >> value.enabled)
VEGA_DBUS_IO(HardwareInventory, << value.cpu << value.gpu << value.ram,
             >> value.cpu >> value.gpu >> value.ram)
VEGA_DBUS_IO(KernelBootStatus, << value.bootloader << value.defaultEntry << value.timeout << value.cmdline,
             >> value.bootloader >> value.defaultEntry >> value.timeout >> value.cmdline)
VEGA_DBUS_IO(NetworkInterface,
             << value.name << value.type << value.state << value.ipv4 << value.ipv6 << value.gateway << value.dns
             << value.mac << value.speed << value.ssid << value.signal << value.device << value.autoconf,
             >> value.name >> value.type >> value.state >> value.ipv4 >> value.ipv6 >> value.gateway >> value.dns
             >> value.mac >> value.speed >> value.ssid >> value.signal >> value.device >> value.autoconf)
VEGA_DBUS_IO(WifiNetwork, << value.ssid << value.security << value.signal << value.active << value.device,
             >> value.ssid >> value.security >> value.signal >> value.active >> value.device)
VEGA_DBUS_IO(ProxyConfig, << value.http << value.https << value.socks << value.noProxy,
             >> value.http >> value.https >> value.socks >> value.noProxy)
VEGA_DBUS_IO(ServiceInfo, << value.name << value.label << value.description << value.enabled << value.active << value.available,
             >> value.name >> value.label >> value.description >> value.enabled >> value.active >> value.available)
VEGA_DBUS_IO(SnapshotInfo, << value.id << value.timestamp << value.trigger << value.description,
             >> value.id >> value.timestamp >> value.trigger >> value.description)
VEGA_DBUS_IO(PackageDetails,
             << value.origin << value.id << value.name << value.description << value.installed << value.installedVersion
             << value.availableVersion << value.downloadSize << value.installedSize << value.dependencies << value.licenses
             << value.url << value.maintainer,
             >> value.origin >> value.id >> value.name >> value.description >> value.installed >> value.installedVersion
             >> value.availableVersion >> value.downloadSize >> value.installedSize >> value.dependencies >> value.licenses
             >> value.url >> value.maintainer)
VEGA_DBUS_IO(PackageRef, << value.origin << value.id << value.name << value.description << value.installed << value.icon,
             >> value.origin >> value.id >> value.name >> value.description >> value.installed >> value.icon)
VEGA_DBUS_IO(RepoInfo, << value.name << value.enabled, >> value.name >> value.enabled)
VEGA_DBUS_IO(StorageVolume,
             << value.name << value.path << value.type << value.fsType << value.size << value.used << value.available
             << value.usePercent << value.mountpoint << value.model << value.removable << value.canMount << value.canUnmount,
             >> value.name >> value.path >> value.type >> value.fsType >> value.size >> value.used >> value.available
             >> value.usePercent >> value.mountpoint >> value.model >> value.removable >> value.canMount >> value.canUnmount)
VEGA_DBUS_IO(UserInfo, << value.name << value.admin, >> value.name >> value.admin)

#undef VEGA_DBUS_IO

void registerDbusTypes() {
    qRegisterMetaType<BackupConfig>();
    qDBusRegisterMetaType<BackupConfig>();
#define VEGA_REGISTER_DBUS(Type) \
    qRegisterMetaType<Type>(); qDBusRegisterMetaType<Type>(); \
    qRegisterMetaType<QList<Type>>(); qDBusRegisterMetaType<QList<Type>>()
    VEGA_REGISTER_DBUS(BackupSnapshot);
    VEGA_REGISTER_DBUS(BluetoothStatus);
    VEGA_REGISTER_DBUS(BluetoothDevice);
    VEGA_REGISTER_DBUS(DateTimeStatus);
    VEGA_REGISTER_DBUS(FirewallService);
    VEGA_REGISTER_DBUS(HardwareInventory);
    VEGA_REGISTER_DBUS(KernelBootStatus);
    VEGA_REGISTER_DBUS(NetworkInterface);
    VEGA_REGISTER_DBUS(WifiNetwork);
    VEGA_REGISTER_DBUS(ProxyConfig);
    VEGA_REGISTER_DBUS(ServiceInfo);
    VEGA_REGISTER_DBUS(SnapshotInfo);
    VEGA_REGISTER_DBUS(PackageDetails);
    VEGA_REGISTER_DBUS(PackageRef);
    VEGA_REGISTER_DBUS(RepoInfo);
    VEGA_REGISTER_DBUS(StorageVolume);
    VEGA_REGISTER_DBUS(UserInfo);
#undef VEGA_REGISTER_DBUS
}
