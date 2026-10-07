import inspect
import pytest


@pytest.mark.asyncio
async def test_adapter_base_interface_and_concrete_imports():
    # Importing the adapters package exercises the abstract base signature and
    # every concrete adapter module, guarding against syntax/import regressions.
    from backend.app.adapters import (  # noqa: F401
        BaseAdapter,
        TMSAdapter,
        SMMSAdapter,
        TDMSAdapter,
        BDMSAdapter,
        COAAdapter,
        GoodsForecastAdapter,
    )

    # The intended BaseAdapter interface: fetch_data is an async method taking self.
    assert inspect.iscoroutinefunction(BaseAdapter.fetch_data)
    sig = inspect.signature(BaseAdapter.fetch_data)
    assert list(sig.parameters) == ["self"]

    for cls in (TMSAdapter, SMMSAdapter, TDMSAdapter, BDMSAdapter, COAAdapter, GoodsForecastAdapter):
        assert issubclass(cls, BaseAdapter)
        assert hasattr(cls, "fetch_data")