#include "mainwindow.h"

#include <QApplication>
#include <QFile>
#include <QLoggingCategory>
#include <QElapsedTimer>
#include <QLocale>
#include <QStandardPaths>
#include <QTranslator>
#include <cstdio>

int main(int argc, char **argv) {
    QElapsedTimer startup;
    startup.start();
    QApplication app(argc, argv);
    QCoreApplication::setOrganizationName(QStringLiteral("LyraOS"));
    QCoreApplication::setApplicationName(QStringLiteral("VegaQt"));
    QCoreApplication::setApplicationVersion(QStringLiteral(VEGA_QT_VERSION));
    QGuiApplication::setDesktopFileName(QStringLiteral("org.lyraos.VegaQt"));
    QLoggingCategory::setFilterRules(QStringLiteral("qt.dbus.debug=false"));

    QTranslator translator;
    const QString translationPath = QStandardPaths::locate(
        QStandardPaths::GenericDataLocation, QStringLiteral("lyra-vega-qt/translations"),
        QStandardPaths::LocateDirectory);
    if (!translationPath.isEmpty() &&
        translator.load(QLocale::system(), QStringLiteral("lyra-vega-qt"),
                        QStringLiteral("_"), translationPath)) {
        app.installTranslator(&translator);
    }

    QFile style(QStringLiteral(":/style.qss"));
    if (style.open(QIODevice::ReadOnly)) app.setStyleSheet(QString::fromUtf8(style.readAll()));

    MainWindow window;
    window.show();
    if (qEnvironmentVariableIsSet("VEGA_QT_BENCHMARK_MARKER"))
        std::fprintf(stderr, "VEGA_QT_WINDOW_READY_MS=%lld\n", static_cast<long long>(startup.elapsed()));
    return app.exec();
}
