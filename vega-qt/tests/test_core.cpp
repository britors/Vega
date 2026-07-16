#include "audit.h"
#include "dbusclient.h"
#include "dbustypes.h"
#include "mainwindow.h"
#include "secretstore.h"

#include <QtTest>
#include <QFile>
#include <QPushButton>
#include <QProgressBar>
#include <QCheckBox>
#include <QLineEdit>
#include <QLabel>
#include <QListWidget>
#include <QMessageBox>
#include <QSpinBox>
#include <QXmlStreamReader>
#include <QTimer>
#include <QDBusPendingCallWatcher>
#include <QDBusMessage>
#include <QDBusMetaType>
#include <memory>

class MockDbusClient final : public DbusClient {
public:
    QStringList calls;
    QVariantList lastArguments;
    QDBusPendingCallWatcher *watch(const QString &interface, const QString &method,
                                   const QVariantList &arguments, QObject *owner) override {
        calls.append(interface + QStringLiteral(".") + method);
        lastArguments = arguments;
        const auto call = QDBusMessage::createMethodCall(
            QStringLiteral("org.test"), QStringLiteral("/test"), interface, method);
        auto reply = call.createReply(method == QStringLiteral("Ping")
            ? QVariant(true) : QVariant(QStringLiteral("mock")));
        return new QDBusPendingCallWatcher(QDBusPendingCall::fromCompletedCall(reply), owner);
    }
};

class CoreTest final : public QObject {
    Q_OBJECT
private slots:
    void errorsAreActionable() {
        QCOMPARE(DbusClient::classify(QStringLiteral("org.freedesktop.DBus.Error.ServiceUnknown")), DbusClient::Error::Unavailable);
        QCOMPARE(DbusClient::classify(QStringLiteral("org.freedesktop.DBus.Error.NoReply")), DbusClient::Error::Timeout);
        QCOMPARE(DbusClient::classify(QStringLiteral("org.freedesktop.DBus.Error.AccessDenied")), DbusClient::Error::Denied);
        QCOMPARE(DbusClient::classify(QStringLiteral("org.freedesktop.PolicyKit1.Error.Cancelled")), DbusClient::Error::Cancelled);
        QVERIFY(!DbusClient::userMessage(DbusClient::Error::Unavailable).isEmpty());
        QVERIFY(DbusClient::userMessage(DbusClient::Error::Denied) !=
                DbusClient::userMessage(DbusClient::Error::Cancelled));
    }
    void allRequiredRoutesExist() {
        MainWindow window;
        const auto routes = window.routeNames();
        for (const auto &route : {"dashboard", "software", "backup", "snapshots", "assistant", "hardware",
                                  "kernel", "datetime", "storage", "network", "bluetooth", "services",
                                  "users", "logs", "about"})
            QVERIFY2(routes.contains(QString::fromLatin1(route)), route);
    }
    void dbusContractsContainRequiredMethods() {
        const QHash<QString, QStringList> contracts = {
            {QStringLiteral("System"), {QStringLiteral("Version"), QStringLiteral("Ping"), QStringLiteral("Distro")}},
            {QStringLiteral("Software"), {QStringLiteral("Search"), QStringLiteral("Install"), QStringLiteral("Remove"), QStringLiteral("UpdateAll")}},
            {QStringLiteral("Backup"), {QStringLiteral("ListConfigs"), QStringLiteral("RunBackupNow"), QStringLiteral("RestoreSnapshot")}},
            {QStringLiteral("Snapshots"), {QStringLiteral("ListSnapshots"), QStringLiteral("CreateSnapshot"), QStringLiteral("Rollback")}},
            {QStringLiteral("Hardware"), {QStringLiteral("Inventory"), QStringLiteral("SwitchNvidiaDriver")}},
            {QStringLiteral("Kernel"), {QStringLiteral("ListInstalled"), QStringLiteral("Install"), QStringLiteral("Remove")}},
            {QStringLiteral("Storage"), {QStringLiteral("ListVolumes"), QStringLiteral("Mount"), QStringLiteral("Unmount")}},
            {QStringLiteral("DateTime"), {QStringLiteral("Status"), QStringLiteral("Apply")}},
            {QStringLiteral("Network"), {QStringLiteral("ListInterfaces"), QStringLiteral("ConnectWifi"), QStringLiteral("SetProxy")}},
            {QStringLiteral("Firewall"), {QStringLiteral("Status"), QStringLiteral("SetServiceEnabled")}},
            {QStringLiteral("Bluetooth"), {QStringLiteral("Status"), QStringLiteral("Pair"), QStringLiteral("SendFile")}},
            {QStringLiteral("Users"), {QStringLiteral("ListUsers"), QStringLiteral("CreateUser"), QStringLiteral("RemoveUser")}},
            {QStringLiteral("Services"), {QStringLiteral("ListServices"), QStringLiteral("RestartService")}},
            {QStringLiteral("Logs"), {QStringLiteral("Query"), QStringLiteral("ListUnits")}},
        };
        for (auto it = contracts.cbegin(); it != contracts.cend(); ++it) {
            QFile file(QStringLiteral(VEGA_SOURCE_DIR "/dbus/org.lyraos.Vega1.%1.xml").arg(it.key()));
            QVERIFY2(file.open(QIODevice::ReadOnly), qPrintable(file.fileName()));
            QXmlStreamReader xml(&file);
            QStringList methods;
            while (!xml.atEnd()) {
                xml.readNext();
                if (xml.isStartElement() && xml.name() == QStringLiteral("method"))
                    methods.append(xml.attributes().value(QStringLiteral("name")).toString());
            }
            QVERIFY2(!xml.hasError(), qPrintable(xml.errorString()));
            for (const auto &method : it.value())
                QVERIFY2(methods.contains(method), qPrintable(it.key() + QStringLiteral(".") + method));
        }
    }
    void representativeMutationsAreExposed() {
        MainWindow window;
        for (const auto &name : {
                 "action.Software.Install", "action.Snapshots.Rollback", "action.Kernel.Remove",
                 "action.Storage.Unmount", "action.Users.RemoveUser", "action.Services.RestartService",
                 "action.Network.ConnectWifi", "action.Firewall.SetServiceEnabled",
                 "action.Bluetooth.SendFile", "action.Hardware.SwitchNvidiaDriver"})
            QVERIFY2(window.findChild<QPushButton *>(QString::fromLatin1(name)), name);
    }
    void requiredReadFlowsAreExposed() {
        MainWindow window;
        for (const auto &name : {
                 "action.Software.Search", "action.Software.GetPackageDetails",
                 "action.Software.ListInstalled", "action.Software.ListRepos",
                 "action.Software.PackageManagerName", "action.Software.CommunityLayerName",
                 "action.Backup.ListSnapshots", "action.Backup.ListSnapshotPaths",
                 "action.Snapshots.DiffPackages", "action.Kernel.AvailablePackages",
                 "action.Kernel.BootStatus", "action.DateTime.ListTimezones",
                 "action.DateTime.ListLocales", "action.DateTime.ListKeymaps",
                 "action.Network.ListWifi", "action.Network.GetProxy",
                 "action.Firewall.Status", "action.Firewall.ListServices",
                 "action.Bluetooth.ListDevices", "action.Services.ListAllServices"})
            QVERIFY2(window.findChild<QPushButton *>(QString::fromLatin1(name)), name);
        QVERIFY(window.findChild<QPushButton *>(QStringLiteral("action.Hardware.FirmwareStatus")));
    }
    void backupStructuredTypesAndPartialRestoreAreExposed() {
        registerDbusTypes();
        QCOMPARE(QString::fromLatin1(QDBusMetaType::typeToSignature(QMetaType::fromType<BackupConfig>())),
                 QStringLiteral("(sassss)"));
        MainWindow window;
        QVERIFY(window.findChild<QPushButton *>(QStringLiteral("action.Backup.CreateConfig")));
        QVERIFY(window.findChild<QPushButton *>(QStringLiteral("action.Backup.RestoreItems")));
    }
    void allComplexDbusTypesMatchThePublishedContract() {
        registerDbusTypes();
        const auto signature = []<typename T> {
            return QString::fromLatin1(QDBusMetaType::typeToSignature(QMetaType::fromType<T>()));
        };
        QCOMPARE(signature.operator()<BackupConfig>(), QStringLiteral("(sassss)"));
        QCOMPARE(signature.operator()<QList<BackupSnapshot>>(), QStringLiteral("a(sxtt)"));
        QCOMPARE(signature.operator()<BluetoothStatus>(), QStringLiteral("(bbbbbssbbs)"));
        QCOMPARE(signature.operator()<QList<BluetoothDevice>>(), QStringLiteral("a(ssssbbbbi)"));
        QCOMPARE(signature.operator()<DateTimeStatus>(), QStringLiteral("(sbss)"));
        QCOMPARE(signature.operator()<QList<FirewallService>>(), QStringLiteral("a(ssb)"));
        QCOMPARE(signature.operator()<HardwareInventory>(), QStringLiteral("(sss)"));
        QCOMPARE(signature.operator()<KernelBootStatus>(), QStringLiteral("(ssus)"));
        QCOMPARE(signature.operator()<QList<NetworkInterface>>(), QStringLiteral("a(ssssssssssusb)"));
        QCOMPARE(signature.operator()<QList<WifiNetwork>>(), QStringLiteral("a(ssubs)"));
        QCOMPARE(signature.operator()<ProxyConfig>(), QStringLiteral("(ssss)"));
        QCOMPARE(signature.operator()<QList<ServiceInfo>>(), QStringLiteral("a(sssbbb)"));
        QCOMPARE(signature.operator()<QList<SnapshotInfo>>(), QStringLiteral("a(uxss)"));
        QCOMPARE(signature.operator()<PackageDetails>(), QStringLiteral("(ssssbssssasasss)"));
        QCOMPARE(signature.operator()<QList<PackageRef>>(), QStringLiteral("a(ssssbs)"));
        QCOMPARE(signature.operator()<QList<RepoInfo>>(), QStringLiteral("a(sb)"));
        QCOMPARE(signature.operator()<QList<StorageVolume>>(), QStringLiteral("a(sssssssussbbb)"));
        QCOMPARE(signature.operator()<QList<UserInfo>>(), QStringLiteral("a(sb)"));
    }
    void backupConfigIsMarshalledAsTheContractStructure() {
        auto *client = new MockDbusClient;
        MainWindow window(nullptr, client);
        auto *button = window.findChild<QPushButton *>(QStringLiteral("action.Backup.CreateConfig"));
        QVERIFY(button);
        const auto editors = button->parentWidget()->findChildren<QLineEdit *>();
        QCOMPARE(editors.size(), 5);
        editors.at(0)->setText(QStringLiteral("documents"));
        editors.at(1)->setText(QStringLiteral("/home/demo/Documents, /home/demo/Pictures"));
        editors.at(2)->setText(QStringLiteral("/mnt/backup"));
        editors.at(3)->setText(QString());
        editors.at(4)->setText(QStringLiteral("daily"));
        QTimer::singleShot(0, [] {
            for (auto *widget : QApplication::topLevelWidgets())
                if (auto *dialog = qobject_cast<QMessageBox *>(widget))
                    dialog->button(QMessageBox::Ok)->click();
        });
        button->click();
        QCoreApplication::processEvents();
        QVERIFY(client->calls.contains(QStringLiteral("org.lyraos.Vega1.Backup.CreateConfig")));
        QCOMPARE(client->lastArguments.size(), 1);
        QVERIFY(client->lastArguments.first().canConvert<BackupConfig>());
        const auto config = client->lastArguments.first().value<BackupConfig>();
        QCOMPARE(config.id, QStringLiteral("documents"));
        QCOMPARE(config.paths, QStringList({QStringLiteral("/home/demo/Documents"),
                                            QStringLiteral("/home/demo/Pictures")}));
        QCOMPARE(config.frequency, QStringLiteral("daily"));
    }
    void transactionSignalsAreCorrelated() {
        MainWindow window;
        auto *progress = window.findChild<QProgressBar *>(QStringLiteral("transactionProgress"));
        QVERIFY(progress);
        window.trackTransaction(42);
        QVERIFY(window.tracksTransaction(42));
        QVERIFY(QMetaObject::invokeMethod(&window, "transactionProgress", Qt::DirectConnection,
                                          Q_ARG(quint32, 7), Q_ARG(quint32, 99), Q_ARG(QString, QStringLiteral("tardia"))));
        QCOMPARE(progress->value(), 0);
        QVERIFY(QMetaObject::invokeMethod(&window, "transactionProgress", Qt::DirectConnection,
                                          Q_ARG(quint32, 42), Q_ARG(quint32, 55), Q_ARG(QString, QStringLiteral("baixando"))));
        QCOMPARE(progress->value(), 55);
        QVERIFY(QMetaObject::invokeMethod(&window, "transactionFinished", Qt::DirectConnection,
                                          Q_ARG(quint32, 42), Q_ARG(bool, true), Q_ARG(QString, QStringLiteral("ok"))));
        QVERIFY(!window.tracksTransaction(42));
    }
    void onlyLongRunningMethodsStartTransactions() {
        QVERIFY(DbusClient::startsTransaction(QStringLiteral("Software"), QStringLiteral("Install")));
        QVERIFY(DbusClient::startsTransaction(QStringLiteral("Backup"), QStringLiteral("RestoreItems")));
        QVERIFY(DbusClient::startsTransaction(QStringLiteral("Kernel"), QStringLiteral("Install")));
        QVERIFY(!DbusClient::startsTransaction(QStringLiteral("Snapshots"), QStringLiteral("CreateSnapshot")));
        QVERIFY(!DbusClient::startsTransaction(QStringLiteral("Snapshots"), QStringLiteral("Rollback")));
        QVERIFY(!DbusClient::startsTransaction(QStringLiteral("Users"), QStringLiteral("CreateUser")));
    }
    void aurRequiresPerPackageReview() {
        MainWindow window;
        QVERIFY(!window.canInstallAur(QStringLiteral("demo")));
        window.markAurReviewed(QStringLiteral("demo"));
        QVERIFY(window.canInstallAur(QStringLiteral("demo")));
        QVERIFY(!window.canInstallAur(QStringLiteral("outro")));
        QVERIFY(window.findChild<QPushButton *>(QStringLiteral("action.Software.GetAurPkgbuild")));
    }
    void interactiveControlsHaveAccessibleNames() {
        MainWindow window;
        const auto lines = window.findChildren<QLineEdit *>();
        QVERIFY(!lines.isEmpty());
        for (const auto *line : lines) {
            const auto *spin = qobject_cast<QSpinBox *>(line->parentWidget());
            QVERIFY2(!line->accessibleName().isEmpty() || (spin && !spin->accessibleName().isEmpty()),
                     qPrintable(line->objectName()));
        }
        const auto checks = window.findChildren<QCheckBox *>();
        QVERIFY(!checks.isEmpty());
        for (const auto *check : checks) QVERIFY(!check->accessibleName().isEmpty());
        const auto buttons = window.findChildren<QPushButton *>();
        for (const auto *button : buttons)
            QVERIFY2(!button->accessibleName().isEmpty() || !button->text().isEmpty(), qPrintable(button->objectName()));
        qsizetype nativePickers = 0;
        for (const auto *button : buttons)
            if (button->text() == QStringLiteral("Selecionar…")) ++nativePickers;
        QVERIFY(nativePickers >= 5);
    }
    void keyboardNavigationRestoresFocusToThePageHeading() {
        MainWindow window;
        window.show();
        auto *navigation = window.findChild<QListWidget *>(QStringLiteral("mainNavigation"));
        QVERIFY(navigation);
        navigation->setCurrentRow(1);
        QCoreApplication::processEvents();
        auto *page = window.findChild<QWidget *>(QStringLiteral("software"));
        QVERIFY(page);
        auto *heading = page->findChild<QLabel *>(QStringLiteral("pageTitle"));
        QVERIFY(heading);
        QCOMPARE(heading->focusPolicy(), Qt::StrongFocus);
        QVERIFY(heading->hasFocus());
    }
    void aboutShowsIndependentVersionsLicenseAndLinks() {
        MainWindow window;
        auto *versions = window.findChild<QLabel *>(QStringLiteral("aboutVersions"));
        auto *release = window.findChild<QLabel *>(QStringLiteral("aboutRelease"));
        auto *links = window.findChild<QLabel *>(QStringLiteral("aboutLinks"));
        QVERIFY(versions && versions->text().contains(QStringLiteral(VEGA_QT_VERSION)));
        QVERIFY(versions->text().contains(QString::fromLatin1(qVersion())));
        QVERIFY(release && release->text().contains(QStringLiteral("GPL-3.0-only")));
        QVERIFY(links && links->openExternalLinks());
    }
    void qtCredentialsUseAnIndependentSecretServiceIdentity() {
        QCOMPARE(SecretStore::applicationAttribute(), QStringLiteral("lyra-vega-qt"));
        const auto attributes = SecretStore::attributes(QStringLiteral("openai"));
        QVERIFY(attributes.contains(QStringLiteral("application")));
        QVERIFY(attributes.contains(QStringLiteral("provider")));
        QVERIFY(!attributes.contains(QStringLiteral("lyra-vega-gtk")));
        MainWindow window;
        QVERIFY(window.findChild<QCheckBox *>(QStringLiteral("assistantStreaming")));
    }
    void auditRedactsSensitiveValues() {
        const auto value = Audit::redact(QStringLiteral("ana@example.com sk-123456789 /home/ana/doc 192.168.1.2"));
        QVERIFY(!value.contains(QStringLiteral("ana@example.com")));
        QVERIFY(!value.contains(QStringLiteral("sk-123")));
        QVERIFY(!value.contains(QStringLiteral("/home/ana")));
        QVERIFY(!value.contains(QStringLiteral("192.168")));
    }
    void pagesCanBeCreatedAndDiscardedRepeatedly() {
        for (int iteration = 0; iteration < 20; ++iteration) {
            auto window = std::make_unique<MainWindow>();
            QCOMPARE(window->routeNames().size(), 15);
            window.reset();
            QCoreApplication::processEvents();
        }
    }
    void controllersWorkWithMockedDbusWithoutDaemon() {
        auto *client = new MockDbusClient;
        MainWindow window(nullptr, client);
        QCoreApplication::processEvents();
        QVERIFY(client->calls.contains(QStringLiteral("org.lyraos.Vega1.System.Version")));
        QVERIFY(client->calls.contains(QStringLiteral("org.lyraos.Vega1.Software.ListUpdates")));
        QVERIFY(client->calls.contains(QStringLiteral("org.lyraos.Vega1.Users.ListUsers")));
    }
};

QTEST_MAIN(CoreTest)
#include "test_core.moc"
