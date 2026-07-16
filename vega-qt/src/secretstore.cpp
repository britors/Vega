#include "secretstore.h"

#include <QProcess>
#include <QStandardPaths>

SecretStore::SecretStore(QObject *parent) : QObject(parent) {}

bool SecretStore::isAvailable() const {
    return !QStandardPaths::findExecutable(QStringLiteral("secret-tool")).isEmpty();
}

QString SecretStore::applicationAttribute() { return QStringLiteral("lyra-vega-qt"); }

QStringList SecretStore::attributes(const QString &provider) {
    return {QStringLiteral("application"), applicationAttribute(), QStringLiteral("provider"), provider};
}

void SecretStore::store(const QString &provider, const QString &secret, QObject *context,
                        Completion completion) {
    if (!isAvailable()) {
        completion(false, tr("Secret Service indisponível. Instale secret-tool e desbloqueie o keyring."));
        return;
    }
    if (secret.trimmed().isEmpty()) {
        completion(false, tr("A chave não pode estar vazia."));
        return;
    }
    auto *process = new QProcess(context);
    process->setProgram(QStringLiteral("secret-tool"));
    auto arguments = QStringList{QStringLiteral("store"), QStringLiteral("--label=Vega Qt — Assistente de IA")};
    arguments.append(attributes(provider));
    process->setArguments(arguments);
    process->setProcessChannelMode(QProcess::SeparateChannels);
    connect(process, &QProcess::started, process, [process, secret] {
        process->write(secret.trimmed().toUtf8());
        process->closeWriteChannel();
    });
    connect(process, &QProcess::errorOccurred, process, [process, completion](QProcess::ProcessError) {
        completion(false, tr("Não foi possível acessar o Secret Service."));
        process->deleteLater();
    });
    connect(process, qOverload<int, QProcess::ExitStatus>(&QProcess::finished), process,
            [process, completion](int code, QProcess::ExitStatus status) {
        completion(status == QProcess::NormalExit && code == 0,
                   status == QProcess::NormalExit && code == 0
                       ? tr("Chave salva com segurança no keyring.")
                       : tr("O Secret Service recusou ou cancelou a operação."));
        process->deleteLater();
    });
    process->start();
}

void SecretStore::clear(const QString &provider, QObject *context, Completion completion) {
    if (!isAvailable()) {
        completion(false, tr("Secret Service indisponível."));
        return;
    }
    auto *process = new QProcess(context);
    process->setProgram(QStringLiteral("secret-tool"));
    auto arguments = QStringList{QStringLiteral("clear")};
    arguments.append(attributes(provider));
    process->setArguments(arguments);
    connect(process, qOverload<int, QProcess::ExitStatus>(&QProcess::finished), process,
            [process, completion](int code, QProcess::ExitStatus status) {
        completion(status == QProcess::NormalExit && code == 0,
                   status == QProcess::NormalExit && code == 0
                       ? tr("Chave removida do keyring.")
                       : tr("Não foi possível remover a chave."));
        process->deleteLater();
    });
    process->start();
}

void SecretStore::load(const QString &provider, QObject *context, Completion completion) {
    if (!isAvailable()) {
        completion(false, tr("Secret Service indisponível."));
        return;
    }
    auto *process = new QProcess(context);
    process->setProgram(QStringLiteral("secret-tool"));
    auto arguments = QStringList{QStringLiteral("lookup")};
    arguments.append(attributes(provider));
    process->setArguments(arguments);
    process->setProcessChannelMode(QProcess::SeparateChannels);
    connect(process, qOverload<int, QProcess::ExitStatus>(&QProcess::finished), process,
            [process, completion](int code, QProcess::ExitStatus status) {
        const auto secret = QString::fromUtf8(process->readAllStandardOutput()).trimmed();
        const bool success = status == QProcess::NormalExit && code == 0 && !secret.isEmpty();
        completion(success, success ? secret : tr("Nenhuma chave configurada para este provedor."));
        process->deleteLater();
    });
    process->start();
}
