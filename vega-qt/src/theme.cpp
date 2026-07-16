#include "theme.h"

#include <QtMath>

namespace {
double linearComponent(int component) {
    const double value = component / 255.0;
    return value <= 0.04045 ? value / 12.92 : qPow((value + 0.055) / 1.055, 2.4);
}

double luminance(const QColor &color) {
    return 0.2126 * linearComponent(color.red()) +
           0.7152 * linearComponent(color.green()) +
           0.0722 * linearComponent(color.blue());
}
}

QPalette VegaTheme::palette(const QString &requested, const QPalette &systemPalette,
                            DesktopScheme desktopScheme) {
    QString theme = requested;
    if (theme == QStringLiteral("system")) {
        if (desktopScheme == DesktopScheme::Dark) theme = QStringLiteral("dark");
        else if (desktopScheme == DesktopScheme::Light) theme = QStringLiteral("light");
        else return systemPalette;
    }
    const bool dark = theme == QStringLiteral("dark");
    QPalette result;
    const QColor window = dark ? QColor(30, 30, 30) : QColor(250, 250, 250);
    const QColor base = dark ? QColor(24, 24, 24) : QColor(255, 255, 255);
    const QColor button = dark ? QColor(48, 48, 48) : QColor(240, 240, 240);
    const QColor text = dark ? QColor(245, 245, 245) : QColor(32, 32, 32);
    result.setColor(QPalette::Window, window);
    result.setColor(QPalette::WindowText, text);
    result.setColor(QPalette::Base, base);
    result.setColor(QPalette::AlternateBase, button);
    result.setColor(QPalette::Text, text);
    result.setColor(QPalette::Button, button);
    result.setColor(QPalette::ButtonText, text);
    result.setColor(QPalette::ToolTipBase, base);
    result.setColor(QPalette::ToolTipText, text);
    result.setColor(QPalette::Highlight, QColor(26, 95, 180));
    result.setColor(QPalette::HighlightedText, QColor(255, 255, 255));
    result.setColor(QPalette::PlaceholderText, dark ? QColor(170, 170, 170) : QColor(100, 100, 100));
    return result;
}

double VegaTheme::contrastRatio(const QColor &foreground, const QColor &background) {
    const double first = luminance(foreground);
    const double second = luminance(background);
    const double lighter = qMax(first, second);
    const double darker = qMin(first, second);
    return (lighter + 0.05) / (darker + 0.05);
}
