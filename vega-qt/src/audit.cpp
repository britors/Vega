#include "audit.h"

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QStandardPaths>

QString Audit::redact(const QString &value) {
    QString result = value;
    result.replace(QRegularExpression(QStringLiteral(R"(\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b)")),
                   QStringLiteral("[email redigido]"));
    result.replace(QRegularExpression(QStringLiteral(R"(\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{8,})\b)")),
                   QStringLiteral("[chave redigida]"));
    result.replace(QRegularExpression(QStringLiteral(R"((?:^|\s)/home/[^\s]+)")),
                   QStringLiteral(" [path redigido]"));
    result.replace(QRegularExpression(QStringLiteral(R"(\b(?:\d{1,3}\.){3}\d{1,3}\b)")),
                   QStringLiteral("[IP redigido]"));
    return result.left(1000);
}

bool Audit::record(const QString &kind, const QString &detail) {
    const auto directory = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    if (!QDir().mkpath(directory)) return false;
    QFile::setPermissions(directory, QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner);
    QFile file(QDir(directory).filePath(QStringLiteral("ai-audit.jsonl")));
    if (!file.open(QIODevice::WriteOnly | QIODevice::Append | QIODevice::Text)) return false;
    QFile::setPermissions(file.fileName(), QFileDevice::ReadOwner | QFileDevice::WriteOwner);
    const QJsonObject entry{
        {QStringLiteral("timestamp"), QDateTime::currentDateTimeUtc().toString(Qt::ISODate)},
        {QStringLiteral("kind"), redact(kind)},
        {QStringLiteral("detail"), redact(detail)},
    };
    file.write(QJsonDocument(entry).toJson(QJsonDocument::Compact));
    file.write("\n");
    return true;
}
