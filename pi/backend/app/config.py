from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mqtt_broker: str = "192.168.1.136"
    mqtt_port: int = 1883
    mqtt_user: str = ""
    mqtt_pass: str = ""
    mqtt_topic_prefix: str = "pumpensteuerung"

    rtu_port: str = "/dev/ttyUSB0"
    rtu_baud: int = 9600
    rtu_slave: int = 1

    tcp_host: str = "0.0.0.0"
    tcp_port: int = 502

    data_dir: Path = Path("/var/lib/pumpe/data")
    db_path: Path = Path("/var/lib/pumpe/state.db")

    api_host: str = "127.0.0.1"
    api_port: int = 8000

    auth_disabled: bool = False
    tz: str = "Europe/Berlin"


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
