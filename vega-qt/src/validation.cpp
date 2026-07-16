#include "validation.h"

#include <QHostAddress>
#include <QRegularExpression>

bool Validation::staticIpv4Cidr(const QString &value) {
    const auto parts = value.trimmed().split(QLatin1Char('/'));
    if (parts.size() != 2) return false;
    QHostAddress address;
    if (!address.setAddress(parts.at(0)) || address.protocol() != QAbstractSocket::IPv4Protocol)
        return false;
    bool validPrefix = false;
    const auto prefix = parts.at(1).toUInt(&validPrefix);
    return validPrefix && prefix <= 32;
}

bool Validation::username(const QString &value) {
    static const QRegularExpression pattern(QStringLiteral("^[a-z_][a-z0-9_-]*\\$?$"));
    return pattern.match(value.trimmed()).hasMatch();
}
