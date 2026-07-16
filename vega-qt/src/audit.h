#pragma once

#include <QString>

class Audit final {
public:
    static QString redact(const QString &value);
    static bool record(const QString &kind, const QString &detail = {});
};
