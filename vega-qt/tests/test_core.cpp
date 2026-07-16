#include "audit.h"
#include "dbusclient.h"
#include "mainwindow.h"
#include "secretstore.h"

#include <QtTest>
#include <QFile>
#include <QPushButton>
#include <QProgressBar>
#include <QCheckBox>
#include <QLineEdit>
#include <QSpinBox>
#include <QXmlStreamReader>
#include <memory>

class CoreTest final : public QObject {
    Q_OBJECT
private slots:
    void errorsAreActionable() {
        QCOMPARE(DbusClient::classify(QStringLiteral("org.freedesktop.DBus.Error.ServiceUnknown")), DbusClient::Error::Unavailable);
        QCOMPARE(DbusClient::classify(QStringLiteral("org.freedesktop.DBus.Error.NoReply")), DbusClient::Error::Timeout);
        QCOMPARE(DbusClient::classify(QStringLiteral("org.freedesktop.DBus.Error.AccessDenied")), DbusClient::Error::Denied);
        QVERIFY(!DbusClient::userMessage(DbusClient::Error::Unavailable).isEmpty());
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
    }
    void qtCredentialsUseAnIndependentSecretServiceIdentity() {
        QCOMPARE(SecretStore::applicationAttribute(), QStringLiteral("lyra-vega-qt"));
        const auto attributes = SecretStore::attributes(QStringLiteral("openai"));
        QVERIFY(attributes.contains(QStringLiteral("application")));
        QVERIFY(attributes.contains(QStringLiteral("provider")));
        QVERIFY(!attributes.contains(QStringLiteral("lyra-vega-gtk")));
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
};

QTEST_MAIN(CoreTest)
#include "test_core.moc"
