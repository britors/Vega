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

struct BackupSnapshot { QString id; qlonglong timestamp; qulonglong fileCount; qulonglong sizeBytes; };
struct BluetoothStatus { bool available; bool powered; bool discoverable; bool pairable; bool scanning; QString controller; QString controllerName; bool transferAvailable; bool receiverActive; QString receivePath; };
struct BluetoothDevice { QString address; QString name; QString alias; QString icon; bool paired; bool trusted; bool connected; bool blocked; qint32 rssi; };
struct DateTimeStatus { QString timezone; bool ntp; QString locale; QString keymap; };
struct FirewallService { QString name; QString label; bool enabled; };
struct HardwareInventory { QString cpu; QString gpu; QString ram; };
struct KernelBootStatus { QString bootloader; QString defaultEntry; quint32 timeout; QString cmdline; };
struct NetworkInterface { QString name; QString type; QString state; QString ipv4; QString ipv6; QString gateway; QString dns; QString mac; QString speed; QString ssid; quint32 signal; QString device; bool autoconf; };
struct WifiNetwork { QString ssid; QString security; quint32 signal; bool active; QString device; };
struct ProxyConfig { QString http; QString https; QString socks; QString noProxy; };
struct ServiceInfo { QString name; QString label; QString description; bool enabled; bool active; bool available; };
struct SnapshotInfo { quint32 id; qlonglong timestamp; QString trigger; QString description; };
struct PackageDetails { QString origin; QString id; QString name; QString description; bool installed; QString installedVersion; QString availableVersion; QString downloadSize; QString installedSize; QStringList dependencies; QStringList licenses; QString url; QString maintainer; };
struct PackageRef { QString origin; QString id; QString name; QString description; bool installed; QString icon; };
struct RepoInfo { QString name; bool enabled; };
struct StorageVolume { QString name; QString path; QString type; QString fsType; QString size; QString used; QString available; quint32 usePercent; QString mountpoint; QString model; bool removable; bool canMount; bool canUnmount; };
struct UserInfo { QString name; bool admin; };

Q_DECLARE_METATYPE(BackupConfig)
Q_DECLARE_METATYPE(BackupSnapshot)
Q_DECLARE_METATYPE(BluetoothStatus)
Q_DECLARE_METATYPE(BluetoothDevice)
Q_DECLARE_METATYPE(DateTimeStatus)
Q_DECLARE_METATYPE(FirewallService)
Q_DECLARE_METATYPE(HardwareInventory)
Q_DECLARE_METATYPE(KernelBootStatus)
Q_DECLARE_METATYPE(NetworkInterface)
Q_DECLARE_METATYPE(WifiNetwork)
Q_DECLARE_METATYPE(ProxyConfig)
Q_DECLARE_METATYPE(ServiceInfo)
Q_DECLARE_METATYPE(SnapshotInfo)
Q_DECLARE_METATYPE(PackageDetails)
Q_DECLARE_METATYPE(PackageRef)
Q_DECLARE_METATYPE(RepoInfo)
Q_DECLARE_METATYPE(StorageVolume)
Q_DECLARE_METATYPE(UserInfo)

QDBusArgument &operator<<(QDBusArgument &argument, const BackupConfig &config);
const QDBusArgument &operator>>(const QDBusArgument &argument, BackupConfig &config);
#define VEGA_DECLARE_DBUS_IO(Type) \
    QDBusArgument &operator<<(QDBusArgument &argument, const Type &value); \
    const QDBusArgument &operator>>(const QDBusArgument &argument, Type &value)
VEGA_DECLARE_DBUS_IO(BackupSnapshot);
VEGA_DECLARE_DBUS_IO(BluetoothStatus);
VEGA_DECLARE_DBUS_IO(BluetoothDevice);
VEGA_DECLARE_DBUS_IO(DateTimeStatus);
VEGA_DECLARE_DBUS_IO(FirewallService);
VEGA_DECLARE_DBUS_IO(HardwareInventory);
VEGA_DECLARE_DBUS_IO(KernelBootStatus);
VEGA_DECLARE_DBUS_IO(NetworkInterface);
VEGA_DECLARE_DBUS_IO(WifiNetwork);
VEGA_DECLARE_DBUS_IO(ProxyConfig);
VEGA_DECLARE_DBUS_IO(ServiceInfo);
VEGA_DECLARE_DBUS_IO(SnapshotInfo);
VEGA_DECLARE_DBUS_IO(PackageDetails);
VEGA_DECLARE_DBUS_IO(PackageRef);
VEGA_DECLARE_DBUS_IO(RepoInfo);
VEGA_DECLARE_DBUS_IO(StorageVolume);
VEGA_DECLARE_DBUS_IO(UserInfo);
#undef VEGA_DECLARE_DBUS_IO
void registerDbusTypes();
